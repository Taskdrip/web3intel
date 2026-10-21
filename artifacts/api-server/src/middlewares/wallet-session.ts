import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request } from "express";

const COOKIE_NAME = "web3_wallet_session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;

export type WalletSession = {
  address: string;
  userId: string;
  expiresAt: number;
};

type SessionPayload = {
  address: string;
  exp: number;
  sub: string;
};

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not configured.");
  return secret;
}

function signatureFor(payload: string): Buffer {
  return createHmac("sha256", sessionSecret()).update(payload).digest();
}

export function createWalletSession(address: string): {
  token: string;
  maxAge: number;
} {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload: SessionPayload = {
    address: address.toLowerCase(),
    exp: expiresAt,
    sub: `wallet:${address.toLowerCase()}`,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = signatureFor(encoded).toString("base64url");
  return { token: `${encoded}.${signature}`, maxAge: SESSION_SECONDS };
}

export function readWalletSessionToken(token?: string): WalletSession | null {
  if (!token) return null;
  const [encoded, encodedSignature, extra] = token.split(".");
  if (!encoded || !encodedSignature || extra) return null;

  try {
    const expected = signatureFor(encoded);
    const received = Buffer.from(encodedSignature, "base64url");
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
      return null;
    }

    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as SessionPayload;
    if (
      typeof payload.address !== "string" ||
      !/^0x[a-f0-9]{40}$/.test(payload.address) ||
      payload.sub !== `wallet:${payload.address}` ||
      !Number.isInteger(payload.exp) ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return {
      address: payload.address,
      userId: payload.sub,
      expiresAt: payload.exp,
    };
  } catch {
    return null;
  }
}

export function getWalletSessionFromRequest(req: Request): WalletSession | null {
  return readWalletSessionToken(req.cookies?.[COOKIE_NAME]);
}

export function walletSessionCookieName(): string {
  return COOKIE_NAME;
}
