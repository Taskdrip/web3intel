import { Router, type IRouter } from "express";
import authRouter from "./auth";
import healthRouter from "./health";
import marketRouter from "./market";
import newsRouter from "./news";
import blockchainRouter from "./blockchain";
import walletRouter from "./wallet";
import intelligenceRouter from "./intelligence";
import walletWatchRouter from "./wallet-watch";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(authRouter);
router.use(healthRouter);
router.use(marketRouter);
router.use(newsRouter);
router.use(blockchainRouter);
router.use(walletRouter);
router.use(intelligenceRouter);
router.use(walletWatchRouter);
router.use(adminRouter);

export default router;
