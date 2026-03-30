import { ApiPromise, WsProvider } from "@polkadot/api";
import "@polkadot/api-augment";
import chalk from "chalk";
import boxen from "boxen";

import { ensureMongoRunning, connectDB } from "./dbconn/db";


import { onInit } from "./services/SubstrateXode";

async function start() {
  // 1. Docker MongoDB 상태 확인 및 실행
  await ensureMongoRunning();

  // 2. DB 연결
  await connectDB();

  // ... 기존 인덱싱 로직
  await onInit();
}

start().catch(console.error);
