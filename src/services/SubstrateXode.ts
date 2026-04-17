import { ApiPromise, WsProvider } from "@polkadot/api";
import { formatBalance } from "@polkadot/util";
import { Json } from "@polkadot/types";
import "@polkadot/api-augment";
import dotenv from "dotenv";
// CLI 출력용 라이브러리
import chalk from "chalk";
import boxen from "boxen";
import Table from "cli-table3";

// DB 관련 함수들
import { XodeAsset, XodeBlock, XodeTransaction, XodeEvent } from "../dbconn/db";

// queue 관련 함수들
import { mqClient } from "../queue/mqClient";
import { SignedBlock, AssetMetadata } from "@polkadot/types/interfaces";
import { FrameSystemEventRecord } from "@polkadot/types/lookup";
import { parse } from "path";

interface IArgsExtrinsic {
  dest?: { Id: any };
  value?: any;
}

dotenv.config();
// 자산 메타데이터 저장 모델 (예시)

async function onAssetMeta(api: ApiPromise, assetId: number) {
  // 1. assets.metadata 스토리지의 모든 항목을 가져옵니다.
  const entries = await api.query.assets.metadata.entries();

  for (const [storageKey, metadata] of entries) {
    const assetId = (storageKey.args[0] as any).toNumber();

    // 1. Storage에서 데이터 조회
    const details = await api.query.assets.asset(assetId);

    // 2. Metadata 처리 (기존과 동일)
    const meta = metadata.toHuman() as any;

    // 3. Details(Owner 정보 등) 처리 - 안전한 JSON 변환 방식 사용
    const detailsJson = details.toJSON() as any;
    const owner = detailsJson?.owner ? detailsJson.owner.toString() : "";

    await XodeAsset.findOneAndUpdate(
      { assetId },
      {
        assetId,
        name: meta.name,
        symbol: meta.symbol,
        decimals: Number(meta.decimals),
        owner,
        updatedAt: new Date(),
      },
      { upsert: true },
    );
  }
}
// 블록 하나를 인덱싱하는 공통 로직 (실시간/과거 공용)
async function onChain(api: ApiPromise, blockNumber: number) {
  try {
    const properties = await api.rpc.system.properties();
    const propertiesSymbol = properties.tokenSymbol.toHuman();
    const propertiesDecimals = properties.tokenDecimals.toHuman();

    // console.log(`코인 심볼: ${properties.tokenSymbol.toHuman()}`); // 예: ["DOT"]
    // console.log(`소수점 자리수: ${properties.tokenDecimals.toHuman()}`); // 예: [10]

    const blockHash = await api.rpc.chain.getBlockHash(blockNumber);
    const [signedBlock, eventsRecords] = await Promise.all([
      api.rpc.chain.getBlock(blockHash),
      api.query.system.events.at(blockHash),
    ]);

    if (!signedBlock || !eventsRecords) {
      return false;
    }

    //
    const rawData = signedBlock.toHuman(); // 블록의 원시 데이터를 사람이 읽을 수 있는 형태로 변환
    const rawEvents = eventsRecords.toHuman();
    const rawExtrinsics = signedBlock.block.extrinsics;

    const docTx: any[] = [];
    const docEvent: any[] = [];

    // console.log(rawEvents);
    // console.log(rawExtrinsics);

    // 1. 블록의 extrinsic 요약 정보 생성
    const summary = {
      txCount: signedBlock.block.extrinsics.length,
      isFinalized: true, // subscribeFinalizedHeads에서 호출되므로 항상 최종화된 블록입니다.
    };

    // 1. 블록의 정보에서 extrinsic과 이벤트를 추출하여 트랜잭션과 이벤트 데이터를 구조화합니다.
    for (let index = 0; index < rawExtrinsics.length; index++) {
      const ex = rawExtrinsics[index];
      const {
        isSigned,
        method: { method, section },
        signer,
        hash,
      } = ex;

      let from = isSigned ? signer.toString() : "system";
      let to = "";
      let amount = "0";
      let success = false;

      const relevantEvents = eventsRecords.filter(
        ({ phase }) =>
          phase.isApplyExtrinsic && phase.asApplyExtrinsic.toNumber() === index,
      );

      success = relevantEvents.some(({ event }) =>
        api.events.system.ExtrinsicSuccess.is(event),
      );

      // 1-4. 전송 정보(from, to, amount) 추출
      if (section === "balances" && method.includes("transfer")) {
        const { args } = ex.method;

        // 익스트린식 매개변수에서 데이터 추출
        to = args[0].toString();
        amount = args[1].toString();

        // 실제 전송 금액은 이벤트를 통해 더 정확히 알 수 있습니다 (특히 transferAll의 경우)
        const transferEvent = relevantEvents.find(({ event }) =>
          api.events.balances.Transfer.is(event),
        );
        if (transferEvent) {
          // Transfer 이벤트 데이터: [from, to, amount]
          const [, , evAmount] = transferEvent.event.data;
          amount = evAmount.toString();
        } else if (args[1]) {
          amount = args[1].toString();
        }
      }

      // 1-5. 트랜잭션 데이터 구조화
      const dataTx = {
        hash: hash.toHex(),
        blockNumber,
        module: section,
        method: method,
        from,
        to,
        amount,
        success,
        timestamp: new Date(),
      };

      // 1-6. 트랜잭션 데이터 배열에 추가
      docTx.push(dataTx);
    }
    // 2. 이벤트 로그에서 트랜잭션 관련 이벤트를 추출하여 from, to, amount 등의 정보를 얻습니다.
    // eventsRecords.forEach(async ({ event, phase, topics }, index) => {
    eventsRecords.forEach(async ({event, phase, topics}, index) => {
      const resEvent = event.toHuman() as any;
      const resPhase = phase.toHuman() as any;
      const resTopics = topics.toHuman() as any;
      
      // 2-1. 이벤트 객체 구조 분해
      const types = event.typeDef;

      // 2-2. 이벤트 정보 추출
      const evSection = resEvent.section; // 예: 'balances'
      const evMethod = resEvent.method; // 예: 'Transfer'
      const evData = JSON.parse(JSON.stringify(resEvent.data)); // 이벤트에 포함된 실제 값들 (From, To, Amount 등)

      const evIndex = index ? index : 0; // 이벤트 인덱스 (블록 내에서의 순서)
      // const exParse = phase.isApplyExtrinsic ? phase.asApplyExtrinsic.toNumber() : null; // 해당 이벤트가 관련된 익스트린식 인덱스

      let assetSymbol = propertiesSymbol?.toString() || "NATIVE";
      let assetDecimals = propertiesDecimals?.toString() || "0";

      let eventFrom = "", eventTo = "", eventAmount = "0";
      // console.log(`이벤트: ${section}.${method} | 데이터: ${data.toString()}`);

      // A. 네이티브 코인 (예: DOT, KSM) 전송 처리
      if (api.events.balances.Transfer.is(event)) {
        eventFrom = evData[0]?.toString() || "";
        eventTo = evData[1]?.toString() || "";
        eventAmount = evData[2]?.toString() || "0";
      }

      // B. 자산 팔렛 토큰 (예: USDT, USDC 등) 전송 처리
      if (api.events.assets && api.events.assets.Transferred.is(event)) {
        let assetId = evData[0]?.toString() || "";
        eventFrom = evData[1]?.toString() || "";
        eventTo = evData[2]?.toString() || "";
        eventAmount = evData[3]?.toString() || "0";

        if (assetId != "") {
          // 해당 자산의 메타데이터(심볼, 소수점) 조회
          // 주의: 실시간 조회를 위해 at(blockHash)를 사용하거나 일반 쿼리 사용
          // const metadata = await api.query.assets.metadata(assetId);
          // <Option<AssetMetadata>> 로 타입을 지정합니다.
          // const metadata = await api.query.assets.metadata<Option<AssetMetadata>>(assetId);
          const metadata = await api.query.assets.metadata(assetId);

          if (metadata.isEmpty) {
              assetSymbol = "NA"; // 메타데이터가 없는 경우 처리
          } else {
            let reqData = metadata.toHuman() as any;
            assetSymbol = reqData.symbol?.toString() || assetSymbol;
            assetDecimals = reqData.decimals?.toString() || assetDecimals;
          }
        }
      }

      // C. 전송이 위의 조건이 아닐경우도 기록을 남긴다.
      docEvent.push({
        hash: `${blockHash.toHex()}-${blockNumber.toString()}-${evIndex.toString()}`, // 이벤트 고유 식별자 (블록 해시 + 블록 번호 + 이벤트 인덱스)
        blockNumber: blockNumber,
        blockNumberIDX: evIndex,
        phaseExtrinsic: "", //phase.toJSON(), // phase는 구조가 다양할 수 있으므로 Object로 저장
        module: evSection,
        method: evMethod.toString(),
        section: evSection.toString(),
        keyIDX: evIndex.toString(),
        from: eventFrom,
        to: eventTo,
        amount: eventAmount,
        data: JSON.parse(JSON.stringify(evData)), // 이벤트 데이터는 구조가 다양할 수 있으므로 Object로 저장
        topics: topics,
        success: true, // 이벤트 자체는 성공적으로 발생했으므로 true로 설정 (실제 트랜잭션 성공 여부는 별도 로직 필요)
        timestamp: new Date(),
      });
    });

    // 각 정보에 대한 이슈가 없을 경우 등록
    // 추후에 receiver 에서 필요한 데이터만 발행할 수 있도록 이관을 할것
    await XodeBlock.findOneAndUpdate(
      { blockNumber },
      {
        blockHash: blockHash.toHex(),
        rawData: {
          block: rawData,
          events: rawEvents,
        },
        summary: {
          txCount: summary.txCount,
          isFinalized: summary.isFinalized,
        },
        transactions: docTx,
        timestamp: new Date(),
      },
      { upsert: true },
    );

    if (docTx.length > 0) {
      const operations = docTx.map((tx) => ({
        updateOne: {
          filter: { hash: tx.hash },
          update: { $set: tx },
          upsert: true,
        },
      }));

      await XodeTransaction.bulkWrite(operations);
      // 추후 receiver 에서 필요한 데이터만 발행할 수 있도록 이관을 할것
      // await onChainQueue("xode.node.transaction", JSON.stringify(docTx));
    }

    if (docEvent.length > 0) {
      const operations = docEvent.map((e) => ({
        updateOne: {
          filter: { hash: e.hash },
          update: { $set: e },
          upsert: true,
        },
      }));

      await XodeEvent.bulkWrite(operations);
      // 추후 receiver 에서 필요한 데이터만 발행할 수 있도록 이관을 할것
      // await onChainQueue("xode.node.event", JSON.stringify(docEvent));
    }

    return true;
    // for (const [index, ex] of rawExtrinsics.entries()) {
    //   const extrinsicEvents = eventsRecords.filter(
    //     ({ phase }) =>
    //       phase.isApplyExtrinsic && phase.asApplyExtrinsic.eq(index),
    //   );

    //   for (const { event } of extrinsicEvents) {
    //     let symbol = propertiesSymbol;
    //     let decimals = propertiesDecimals;

    //     // A. 네이티브 코인 (예: DOT, KSM) 전송 처리
    //     if (api.events.balances.Transfer.is(event)) {
    //       const [from, to, amount] = event.data;

    //       const formatted = formatBalance(amount, {
    //         decimals: propertiesDecimals,
    //         withUnit: propertiesSymbol,
    //       });

    //       console.log(`[Native] ${from} -> ${to} | 금액: ${formatted}`);
    //     }

    //     // B. 자산 팔렛 토큰 (예: USDT, USDC 등) 전송 처리
    //     if (api.events.assets && api.events.assets.Transferred.is(event)) {
    //       const [assetId, from, to, amount] = event.data;

    //       if (assetId) {
    //         // 해당 자산의 메타데이터(심볼, 소수점) 조회
    //         // 주의: 실시간 조회를 위해 at(blockHash)를 사용하거나 일반 쿼리 사용
    //         const metadata = await api.query.assets.metadata(assetId);
    //         symbol = metadata.symbol.toHuman();
    //         decimals = metadata.decimals.toNumber();
    //       }

    //       const formatted = formatBalance(amount, {
    //         decimals: decimals,
    //         withUnit: symbol,
    //       });

    //       console.log(
    //         `[Asset ID: ${assetId}] ${from} -> ${to} | 금액: ${formatted}`,
    //       );
    //     }
    //   }
    // }

    // // 3. 각 익스트린식에서 트랜잭션 정보 추출
    // for (let index = 0; index < rawExtrinsics.length; index++) {
    //   const ex = rawExtrinsics[index];
    //   const {
    //     isSigned,
    //     method: { method, section },
    //     signer,
    //     hash,
    //   } = ex;

    //   let from = isSigned ? signer.toString() : "system";
    //   let to = "";
    //   let amount = "0";
    //   let success = false;

    //   const extrinsicEvents = eventsRecords.filter(
    //     ({ phase }) =>
    //       phase.isApplyExtrinsic && phase.asApplyExtrinsic.toNumber() === index,
    //   );

    //   success = extrinsicEvents.some(({ event }) =>
    //     api.events.system.ExtrinsicSuccess.is(event),
    //   );

    //   // 4. 전송 정보(from, to, amount) 추출
    //   if (section === "balances" && method.includes("transfer")) {
    //     const { args } = ex.method as { args: IArgsExtrinsic };

    //     // 익스트린식 매개변수에서 데이터 추출
    //     to = args?.dest?.Id?.toString();
    //     amount = args?.value?.toString();

    //     // 실제 전송 금액은 이벤트를 통해 더 정확히 알 수 있습니다 (특히 transferAll의 경우)
    //     const transferEvent = extrinsicEvents.find(({ event }) =>
    //       api.events.balances.Transfer.is(event),
    //     );

    //     if (transferEvent) {
    //       // Transfer 이벤트 데이터: [from, to, amount]
    //       const [, , evAmount] = transferEvent.event.data;
    //       amount = evAmount.toString();
    //     } else if (args?.value) {
    //       amount = args.value.toString();
    //     }

    //     coinTransTx.push({
    //       hash: hash.toHex(),
    //       blockNumber,
    //       module: section,
    //       method: method,
    //       from,
    //       to,
    //       amount,
    //       success,
    //       timestamp: new Date(),
    //     });
    //   }

    //   // 5. 트랜잭션 데이터 구조화
    //   const dataTx = {
    //     hash: hash.toHex(),
    //     blockNumber,
    //     module: section,
    //     method: method,
    //     from,
    //     to,
    //     amount,
    //     success,
    //     timestamp: new Date(),
    //   };

    //   docTx.push(dataTx);
    // }

    // // 추후에 receiver 에서 필요한 데이터만 발행할 수 있도록 이관을 할것
    // await XodeBlock.findOneAndUpdate(
    //   { blockNumber },
    //   {
    //     blockHash: blockHash.toHex(),
    //     rawData: {
    //       block: rawData,
    //       events: rawEvents,
    //     },
    //     summary: {
    //       txCount: summary.txCount,
    //       isFinalized: summary.isFinalized,
    //     },
    //     transactions: docTx,
    //     timestamp: new Date(),
    //   },
    //   { upsert: true },
    // );

    // 1. RabbitMQ에 메시지 발행 (블록 데이터 전체를 JSON 문자열로 변환하여 발행)
    // await onChainQueue("xode.node.block", JSON.stringify({ blockNumber, blockHash: blockHash.toHex(), rawData: { block: rawData, events: rawEvents }, summary: summary, transactions: docTx, timestamp: new Date() }));

    // 2. 개별 Transaction 저장 (Bulk Write 사용으로 성능 최적화)
    // if (docTx.length > 0) {
    //   const operations = docTx.map((tx) => ({
    //     updateOne: {
    //       filter: { hash: tx.hash },
    //       update: { $set: tx },
    //       upsert: true,
    //     },
    //   }));

    //   await XodeTransaction.bulkWrite(operations);
    //   // 추후 receiver 에서 필요한 데이터만 발행할 수 있도록 이관을 할것
    //   // await onChainQueue("xode.node.transaction", JSON.stringify(docTx));
    // }

    /**
     * 저장이 끝나면 로그를 발생
     */
    // await onChainLog(blockNumber.toString(), blockHash.toHex(), docTx, summary);

    return true;
  } catch (e: any) {
    console.error(
      chalk.red(`Error indexing block #${blockNumber}:`),
      e.message.substring(0, 200),
    ); // 에러 메시지 길이 제한
    return false;
  }
}

async function onChainLog(
  blockNumber: string,
  blockHash: string,
  docTx: any[],
  summary: any,
) {
  /**
   * 저장이 끝나면 로그를 발생
   */
  // 1. 블록 기본 정보 테이블 생성
  const blockTable = new Table({
    head: [chalk.yellow("Property"), chalk.yellow("Value")],
    colWidths: [15, 50],
  });

  blockTable.push(
    ["Block Number", chalk.green.bold(`#${blockNumber}`)],
    ["Hash", chalk.cyan(blockHash)],
    ["Transactions", chalk.magenta(docTx.length)],
    ["Finalized", chalk.blue(summary.isFinalized ? "Yes" : "No")],
  );

  console.log(`\n📦 ${chalk.bgBlue.white(" NEW BLOCK ")}`);
  console.log(blockTable.toString());

  // 2. transactions 테이블 생성
  const txTable = new Table({
    head: [
      chalk.magenta("Module"),
      chalk.magenta("Method"),
      chalk.magenta("From"),
      chalk.magenta("To"),
      chalk.magenta("Amount"),
      chalk.magenta("Success"),
    ],
    colWidths: [15, 15, 20, 20, 15, 10],
  });

  docTx.forEach((tx) => {
    txTable.push([
      tx.module,
      tx.method,
      tx.from,
      tx.to,
      tx.amount,
      tx.success ? chalk.green("Yes") : chalk.red("No"),
    ]);
  });

  console.log(chalk.bold(" ⚡ Transactions:"));
  console.log(txTable.toString());
}

async function onChainQueue(exchangeName: string, message: string) {
  try {
    await mqClient.initialize(exchangeName);
    mqClient.publish(message);
  } catch (error) {
    console.error(
      chalk.red(`Error publishing to queue ${exchangeName}:`),
      error,
    );
  }
}

async function onInit() {
  const rpcUrl = process.env.XODE_RPC_URL || "ws://127.0.0.1:9944";
  const provider = new WsProvider(rpcUrl);

  provider.on("error", (error) => {
    console.error(chalk.bgRed("Provider Error:"), error);
  });
  provider.on("connected", () => {
    console.log(chalk.bgBlue("Provider Connected"));
  });

  // .create() 대신 직접 인스턴스화 후 .isReady 사용 (타임아웃 확인 용이)
  const api = new ApiPromise({ provider });

  try {
    await Promise.race([
      api.isReady,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("API Ready Timeout")), 10000),
      ),
    ]);
    console.log(chalk.bgGreen.black("API is ready"));
  } catch (e: any) {
    api.disconnect();
    console.error(chalk.bgRed("Connection failed:"), e.message);
    return false;
  }

  // 시작 환영 메시지
  console.log(
    boxen(chalk.blue.bold("XODE Indexer Service Started"), {
      padding: 1,
      margin: 1,
      borderStyle: "double",
      borderColor: "blue",
    }),
  );

  await onAssetMeta(api, 1).catch((e) =>
    console.error(chalk.red("Failed to update asset metadata:"), e),
  );

  // DB에서 가장 큰 블록 번호 찾기
  try {
    const lastDoc = await XodeBlock.findOne().sort({ blockNumber: -1 });
    console.log(
      chalk.yellow("Last indexed block in DB:"),
      lastDoc ? `#${lastDoc.blockNumber}` : "None",
    );

    // 4. 블록 동기화 시작 (과거 블록부터 최신 블록까지)
    // const syncState = await api.rpc.system.syncState();
    // const syncStartingBKNumber = syncState.startingBlock ? syncState.startingBlock.toNumber() : 0;
    // const syncCurrentBKNumber = syncState.currentBlock ? syncState.currentBlock.toNumber() : 0;

    // console.log(chalk.yellow(`Node Sync State - Starting Block: #${syncStartingBKNumber}, Current Block: #${syncCurrentBKNumber}`));

    let startBlock = lastDoc ? lastDoc.blockNumber + 1 : 0;
    // startBlock = Math.max(startBlock, syncStartingBKNumber);

    console.log(
      chalk.yellow(`Starting block synchronization from #${startBlock}...`),
    );

    // 네트워크의 현재 최신 확정 블록 번호 가져오기
    const finalizedHead = await api.rpc.chain.getFinalizedHead();
    const header = await api.rpc.chain.getHeader(finalizedHead);

    let currentBlock = header.number.toNumber();
    // currentBlock = Math.max(currentBlock, syncCurrentBKNumber);

    // 현재 체인 높이와 마지막 인덱싱된 블록 번호 로그 출력
    console.log(chalk.cyan(`Current Chain Height: ${currentBlock}`));
    console.log(chalk.cyan(`Last Indexed Block: ${startBlock - 1}`));

    // 아직 인덱싱되지 않은 블록이 있다면 동기화 시작
    if (startBlock <= currentBlock) {
      for (let i = startBlock; i <= currentBlock; i++) {
        process.stdout.write(chalk.gray(`Syncing block #${i}... `));
        const success = await onChain(api, i);
        if (success) process.stdout.write(chalk.green("OK\n"));
        else process.stdout.write(chalk.red("FAILED\n"));
      }
    }

    // 실시간 구독 시작
    await api.rpc.chain.subscribeFinalizedHeads(async (lastHeader) => {
      const blockNumber = lastHeader.number.toNumber();
      console.log(chalk.blue(`New Real-time Block: #${blockNumber}`));
      await onChain(api, blockNumber);
    });

    // 5. 새로운 블록 구독 (실시간 인덱싱)
    console.log(chalk.magenta("Subscribing to new blocks..."));
    const unsubscribe = await api.rpc.chain.subscribeNewHeads(
      async (header) => {
        const blockNumber = header.number.toNumber();
        console.log(chalk.magenta(`New block #${blockNumber}`));
        await onChain(api, blockNumber);
      },
    );
  } catch (e) {
    console.error(chalk.red("Error during initialization:"), e);
  }

  return true;
  api.disconnect();
}

export { onInit };
