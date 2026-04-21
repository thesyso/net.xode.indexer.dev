import { Router } from "express";
import { XODEX } from "../api/xodex";

export function createMasterRouter(xodex: XODEX) {
  const router = Router();

  router.get("/pools", async (_req, res) => {
    try {
      const pools = await xodex.getPools();
      return res.json({ pools });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message ?? "Failed to fetch pools" });
    }
  });

  router.post("/pool", async (req, res) => {
    try {
      const { poolId, assetA, assetB, initialLiquidity } = req.body ?? {};

      if (
        typeof poolId !== "number" ||
        typeof assetA !== "number" ||
        typeof assetB !== "number" ||
        typeof initialLiquidity !== "number"
      ) {
        return res.status(400).json({
          error: "poolId, assetA, assetB, initialLiquidity must be numbers",
        });
      }

      const hash = await xodex.createPool(poolId, assetA, assetB, initialLiquidity);
      return res.json({ hash });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message ?? "Failed to create pool" });
    }
  });

  return router;
}
