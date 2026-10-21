import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { Router, type IRouter, type Request } from "express";
import { getAddress, isAddress } from "ethers";
import { SiweMessage } from "siwe";
import {
  CreateWalletAuthChallengeBody,
  CreateWalletAuthChallengeResponse,
  GetWalletAuthSessionResponse,
  LogoutWalletAuthResponse,
  VerifyWalletAuthBody,
  VerifyWalletAuthResponse,
} from "@workspace/api-zod";
import { db, usersTable } from "@workspace/db";
import {
  createWalletSession,
  getWalletSessionFromRequest,
  walletSessionCookieName,
} from "../middlewares/wallet-session";

const router: IRouter = Router();
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const RATE_WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS_PER_WINDOW = 15;

type PendingChallenge = {
  address: string;
  chainId: number;
  domain: string;
  uri: string;
  expiresAt: number;
};

const pendingChallenges = new Map<string, PendingChallenge>();
const attemptsByIp = new Map<string, { count: number; resetAt: number }>();

function consumeRateLimit(ip: string): boolean {
  const now = Date.now();
  const current = attemptsByIp.get(ip);
  if (!current || current.resetAt <= now) {
    attemptsByIp.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (current.count >= MAX_ATTEMPTS_PER_WINDOW) return false;
  current.count += 1;
  return true;
}

function requestOrigin(req: Request): {
  domain: string;
  uri: string;
} | null {
  const host = req.get("host");
  if (!host || /[\s/\\@]/.test(host)) return null;

  const origin = req.get("origin");
  const forwardedProtocol = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol =
    origin?.startsWith("https://") || forwardedProtocol === "https"
      ? "https"
      : req.protocol === "https"
        ? "https"
        : "http";
  const uri = origin ?? `${protocol}://${host}`;
  try {
    const parsed = new URL(uri);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.host.toLowerCase() !== host.toLowerCase() ||
      parsed.username ||
      parsed.password
    ) {
      return null;
    }
    return { domain: parsed.host, uri: parsed.origin };
  } catch {
    return null;
  }
}

function pruneExpiredChallenges(): void {
  const now = Date.now();
  for (const [nonce, challenge] of pendingChallenges) {
    if (challenge.expiresAt <= now) pendingChallenges.delete(nonce);
  }
  for (const [ip, attempt] of attemptsByIp) {
    if (attempt.resetAt <= now) attemptsByIp.delete(ip);
  }
}

router.post("/wallet-auth/challenge", (req, res): void => {
  pruneExpiredChallenges();
  if (!consumeRateLimit(req.ip || "unknown")) {
    res.status(429).json({ error: "Too many wallet sign-in attempts. Try again shortly." });
    return;
  }

  const parsed = CreateWalletAuthChallengeBody.safeParse(req.body);
  const origin = requestOrigin(req);
  if (!parsed.success || !origin || !isAddress(parsed.data.address)) {
    res.status(400).json({ error: "Provide a valid EVM address and sign-in origin." });
    return;
  }
  if (!process.env.SESSION_SECRET) {
    res.status(503).json({ error: "Wallet authentication is not configured." });
    return;
  }

  const address = getAddress(parsed.data.address);
  const nonce = randomBytes(16).toString("hex");
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + CHALLENGE_TTL_MS);
  const message = new SiweMessage({
    domain: origin.domain,
    address,
    statement: "Sign in to Web3 Intelligence. This request does not authorize a transaction.",
    uri: origin.uri,
    version: "1",
    chainId: parsed.data.chainId,
    nonce,
    issuedAt: issuedAt.toISOString(),
    expirationTime: expiresAt.toISOString(),
  }).prepareMessage();

  pendingChallenges.set(nonce, {
    address: address.toLowerCase(),
    chainId: parsed.data.chainId,
    domain: origin.domain,
    uri: origin.uri,
    expiresAt: expiresAt.getTime(),
  });

  res.json(CreateWalletAuthChallengeResponse.parse({ message, nonce }));
});

router.post("/wallet-auth/verify", async (req, res): Promise<void> => {
  pruneExpiredChallenges();
  if (!consumeRateLimit(req.ip || "unknown")) {
    res.status(429).json({ error: "Too many wallet sign-in attempts. Try again shortly." });
    return;
  }

  const parsed = VerifyWalletAuthBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "The wallet sign-in message or signature is invalid." });
    return;
  }

  let message: SiweMessage;
  try {
    message = new SiweMessage(parsed.data.message);
  } catch {
    res.status(400).json({ error: "The wallet sign-in message is invalid." });
    return;
  }

  const challenge = pendingChallenges.get(message.nonce);
  const origin = requestOrigin(req);
  if (
    !challenge ||
    challenge.expiresAt <= Date.now() ||
    !origin ||
    challenge.domain !== origin.domain ||
    challenge.uri !== origin.uri ||
    message.domain !== challenge.domain ||
    message.uri !== challenge.uri ||
    message.chainId !== challenge.chainId ||
    message.address.toLowerCase() !== challenge.address
  ) {
    res.status(400).json({ error: "The sign-in request expired or does not match this site." });
    return;
  }
  pendingChallenges.delete(message.nonce);

  try {
    const verification = await message.verify({
      signature: parsed.data.signature,
      domain: challenge.domain,
      nonce: message.nonce,
      time: new Date().toISOString(),
    });
    if (!verification.success) {
      res.status(400).json({ error: "The wallet did not sign the requested login message." });
      return;
    }

    const address = getAddress(message.address);
    const userId = `wallet:${address.toLowerCase()}`;
    const [created] = await db
      .insert(usersTable)
      .values({ clerkUserId: userId })
      .onConflictDoNothing()
      .returning();
    const [user] = created
      ? [created]
      : await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.clerkUserId, userId))
          .limit(1);

    if (!user) {
      res.status(503).json({ error: "Your wallet account could not be created." });
      return;
    }
    if (user.status !== "active") {
      res.status(403).json({ error: "This account is not active." });
      return;
    }

    const session = createWalletSession(address);
    res.cookie(walletSessionCookieName(), session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: session.maxAge * 1000,
    });
    res.json(
      VerifyWalletAuthResponse.parse({
        authenticated: true,
        address,
        role: user.role,
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Wallet sign-in could not be completed");
    res.status(503).json({ error: "Wallet sign-in is temporarily unavailable." });
  }
});

router.get("/wallet-auth/session", async (req, res): Promise<void> => {
  const session = getWalletSessionFromRequest(req);
  if (!session) {
    res.json(
      GetWalletAuthSessionResponse.parse({
        authenticated: false,
        address: null,
        role: null,
      }),
    );
    return;
  }

  try {
    const [user] = await db
      .select({ role: usersTable.role, status: usersTable.status })
      .from(usersTable)
      .where(eq(usersTable.clerkUserId, session.userId))
      .limit(1);
    if (!user || user.status !== "active") {
      res.clearCookie(walletSessionCookieName(), { path: "/" });
      res.json(
        GetWalletAuthSessionResponse.parse({
          authenticated: false,
          address: null,
          role: null,
        }),
      );
      return;
    }
    res.json(
      GetWalletAuthSessionResponse.parse({
        authenticated: true,
        address: session.address,
        role: user.role,
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Wallet session could not be loaded");
    res.status(503).json({ error: "Wallet session is temporarily unavailable." });
  }
});

router.post("/wallet-auth/logout", (_req, res): void => {
  res.clearCookie(walletSessionCookieName(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
  res.json(LogoutWalletAuthResponse.parse({ signedOut: true }));
});

export default router;
