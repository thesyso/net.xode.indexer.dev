import { ApiPromise, WsProvider } from "@polkadot/api";
import "@polkadot/api-augment";
import express from "express";
import dotenv from "dotenv";

import { ensureMongoRunning, connectDB } from "./dbconn/db";
import { XODEX } from "./api/xodex";
import { requireMasterAuth, requireUserAuth } from "./middleware/auth";
import { createMasterRouter } from "./routes/master";
import { createUserRouter } from "./routes/user";


import { onInit } from "./services/SubstrateXode";

dotenv.config();

async function createXodexClient(): Promise<XODEX> {
  const rpcUrl = process.env.XODE_RPC_URL || "ws://127.0.0.1:9944";
  const provider = new WsProvider(rpcUrl);
  const api = await ApiPromise.create({ provider });
  return new XODEX(api);
}

async function startApiServer(xodex: XODEX) {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    return res.json({ ok: true });
  });

  app.use("/master", requireMasterAuth, createMasterRouter(xodex));
  app.use("/user", requireUserAuth, createUserRouter(xodex));

  const port = Number(process.env.API_PORT || 3000);
  app.listen(port, () => {
    console.log(`[API] server listening on port ${port}`);
  });
}

async function start() {
  // 1. Docker MongoDB 상태 확인 및 실행
  await ensureMongoRunning();

  // 2. DB 연결
  await connectDB();

  // 3. API 서버 시작
  const xodex = await createXodexClient();
  await startApiServer(xodex);

  // 4. 기존 인덱싱 로직
  await onInit();
}

start().catch(console.error);
