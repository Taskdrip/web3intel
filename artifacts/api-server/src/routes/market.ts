import { Router, type IRouter } from "express";
import {
  GetMarketCoinsQueryParams,
  GetMarketCoinsResponse,
  GetMarketHistoryQueryParams,
  GetMarketHistoryResponse,
  GetMarketOverviewResponse,
} from "@workspace/api-zod";
import {
  getMarketCoins,
  getMarketHistory,
  getMarketOverview,
} from "../lib/market-data";

const router: IRouter = Router();

router.get("/market/overview", async (req, res): Promise<void> => {
  try {
    res.json(GetMarketOverviewResponse.parse(await getMarketOverview()));
  } catch (error) {
    req.log.warn({ err: error }, "Market overview unavailable");
    res.status(503).json({ error: "Market data is temporarily unavailable." });
  }
});

router.get("/market/coins", async (req, res): Promise<void> => {
  const query = GetMarketCoinsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  try {
    res.json(
      GetMarketCoinsResponse.parse(
        await getMarketCoins(query.data.limit ?? 100),
      ),
    );
  } catch (error) {
    req.log.warn({ err: error }, "Market coin list unavailable");
    res.status(503).json({ error: "Market data is temporarily unavailable." });
  }
});

router.get("/market/history", async (req, res): Promise<void> => {
  const query = GetMarketHistoryQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  try {
    const history = await getMarketHistory(
      query.data.coinId,
      query.data.days ?? "7",
    );
    res.json(GetMarketHistoryResponse.parse(history));
  } catch (error) {
    req.log.warn({ err: error }, "Market history unavailable");
    res.status(503).json({ error: "Market history is temporarily unavailable." });
  }
});

export default router;
