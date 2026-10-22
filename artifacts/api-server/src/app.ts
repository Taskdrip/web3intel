import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import cookieParser from "cookie-parser";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import router from "./routes";
import { logger } from "./lib/logger";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import { getWalletSessionFromRequest } from "./middlewares/wallet-session";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const clerkAuthMiddleware = clerkMiddleware((req) => ({
  publishableKey: publishableKeyFromHost(
    getClerkProxyHost(req) ?? "",
    process.env.CLERK_PUBLISHABLE_KEY,
  ),
}));

// Public market, intelligence, and address-lookup routes do not require an
// account. Keep Clerk scoped to account, watchlist, and admin endpoints.
app.use(["/api/auth", "/api/watch", "/api/admin", "/api/shop/orders"], (req, res, next) => {
  const walletSession = getWalletSessionFromRequest(req);
  if (walletSession) {
    res.locals.walletUserId = walletSession.userId;
    next();
    return;
  }
  if (!process.env.CLERK_SECRET_KEY) {
    res.status(503).json({ error: "Account authentication is not configured." });
    return;
  }
  clerkAuthMiddleware(req, res, next);
});

app.use("/api", router);

app.use((error: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  req.log.error({ err: error }, "Unhandled API request error");
  if (res.headersSent) {
    next(error);
    return;
  }
  res.status(500).json({ error: "Internal server error." });
});

export default app;
