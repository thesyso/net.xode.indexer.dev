import { ApiPromise, WsProvider } from "@polkadot/api";
import "@polkadot/api-augment";
import dotenv from "dotenv";
// CLI 출력용 라이브러리
import chalk from "chalk";
import boxen from "boxen";
import Table from "cli-table3";

// DB 관련 함수들
import { XodeAsset, XodeBlock, XodeTransaction } from "../dbconn/db";

// queue 관련 함수들
import { mqClient } from "../queue/mqClient";


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
    const blockHash = await api.rpc.chain.getBlockHash(blockNumber);
    const [signedBlock, allRecords] = await Promise.all([
      api.rpc.chain.getBlock(blockHash),
      api.query.system.events.at(blockHash),
    ]);

    //
    const rawData = signedBlock.toHuman(); // 블록의 원시 데이터를 사람이 읽을 수 있는 형태로 변환
    const rawEvents = allRecords.toHuman();

    const summary = {
      txCount: signedBlock.block.extrinsics.length,
      isFinalized: true, // subscribeFinalizedHeads에서 호출되므로 항상 최종화된 블록입니다.
    };

    const docTx: any[] = [];
    const extrinsics = signedBlock.block.extrinsics;

    for (let index = 0; index < extrinsics.length; index++) {
      const ex = extrinsics[index];
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

      const relevantEvents = allRecords.filter(
        ({ phase }) =>
          phase.isApplyExtrinsic && phase.asApplyExtrinsic.toNumber() === index,
      );

      success = relevantEvents.some(({ event }) =>
        api.events.system.ExtrinsicSuccess.is(event),
      );

      // 4. 전송 정보(from, to, amount) 추출
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

      docTx.push(dataTx);
    }

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

    // 1. RabbitMQ에 메시지 발행 (블록 데이터 전체를 JSON 문자열로 변환하여 발행)
    await onChainQueue("xode.node.block", JSON.stringify({ blockNumber, blockHash: blockHash.toHex(), rawData: { block: rawData, events: rawEvents }, summary: summary, transactions: docTx, timestamp: new Date() }));

    // 2. 개별 Transaction 저장 (Bulk Write 사용으로 성능 최적화)
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
      await onChainQueue("xode.node.transaction", JSON.stringify(docTx));    

    }

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

    return true;
  } catch (e) {
    console.error(chalk.red(`Error indexing block #${blockNumber}:`), e);
    return false;
  }
}

async function onChainQueue(exchangeName: string, message: string) {
  try {
    await mqClient.initialize(exchangeName);
    mqClient.publish(message);
  } catch (error) {
    console.error(chalk.red(`Error publishing to queue ${exchangeName}:`), error);
  }
}

async function onInit() {
  const rpcUrl = process.env.XODE_RPC_URL || "ws://127.0.0.1:9944";
  const provider = new WsProvider(rpcUrl);
  const api = await ApiPromise.create({ provider });

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
  const lastDoc = await XodeBlock.findOne().sort({ blockNumber: -1 });
  let startBlock = lastDoc ? lastDoc.blockNumber + 1 : 0;

  // 네트워크의 현재 최신 확정 블록 번호 가져오기
  const finalizedHead = await api.rpc.chain.getFinalizedHead();
  const header = await api.rpc.chain.getHeader(finalizedHead);
  const currentBlock = header.number.toNumber();

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
}

export { onInit };
