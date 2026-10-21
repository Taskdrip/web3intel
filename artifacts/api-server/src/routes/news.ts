import { Router, type IRouter } from "express";
import { GetLatestNewsResponse } from "@workspace/api-zod";
import { getLatestNews } from "../lib/news-data";

const router: IRouter = Router();

router.get("/news/latest", async (req, res): Promise<void> => {
  try {
    res.json(GetLatestNewsResponse.parse(await getLatestNews()));
  } catch (error) {
    req.log.warn({ err: error }, "News feeds unavailable");
    res.status(503).json({ error: "News feeds are temporarily unavailable." });
  }
});

export default router;
