import { Router } from "express";
import { XODEX } from "../api/xodex";

export function createUserRouter(xodex: XODEX) {
  const router = Router();

  router.get("/pool/:poolId", async (req, res) => {
    try {
      const poolId = Number(req.params.poolId);
      if (Number.isNaN(poolId)) {
        return res.status(400).json({ error: "poolId must be a number" });
      }

      const poolInfo = await xodex.getPoolInfo(poolId);
      return res.json({ poolInfo });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message ?? "Failed to fetch pool info" });
    }
  });

  router.post("/pool/register", async (req, res) => {
    try {
      const { userMnemonic, poolId, assetAAmount, assetBAmount } = req.body ?? {};

      if (
        typeof userMnemonic !== "string" ||
        typeof poolId !== "number" ||
        typeof assetAAmount !== "number" ||
        typeof assetBAmount !== "number"
      ) {
        return res.status(400).json({
          error: "userMnemonic(string), poolId(number), assetAAmount(number), assetBAmount(number) are required",
        });
      }

      const result = await xodex.registerUserToPool(userMnemonic, poolId, assetAAmount, assetBAmount);
      return res.json(result);
    } catch (error: any) {
      return res.status(500).json({ error: error?.message ?? "Failed to register user to pool" });
    }
  });

  return router;
}
