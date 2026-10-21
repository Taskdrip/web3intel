import { Router, type IRouter } from "express";
import authRouter from "./auth";
import healthRouter from "./health";
import marketRouter from "./market";
import walletRouter from "./wallet";
import intelligenceRouter from "./intelligence";

const router: IRouter = Router();

router.use(authRouter);
router.use(healthRouter);
router.use(marketRouter);
router.use(walletRouter);
router.use(intelligenceRouter);

export default router;
