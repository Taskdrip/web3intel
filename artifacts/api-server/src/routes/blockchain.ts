import { Router, type IRouter } from "express";
import { GetBlockchainStatusResponse } from "@workspace/api-zod";
import { getBlockchainStatus } from "../lib/blockchain-data";

const router: IRouter = Router();

router.get("/blockchain/status", async (req, res): Promise<void> => {
  try {
    res.json(GetBlockchainStatusResponse.parse(await getBlockchainStatus()));
  } catch (error) {
    req.log.warn({ err: error }, "Blockchain status providers unavailable");
    res.status(503).json({ error: "Blockchain status is temporarily unavailable." });
  }
});

export default router;
