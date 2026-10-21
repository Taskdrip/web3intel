import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  CreateWalletWatchBody,
  DeleteWalletWatchQueryParams,
  GetWalletWatchActivityQueryParams,
  GetWalletWatchActivityResponse,
  ListWalletWatchesResponse,
} from "@workspace/api-zod";
import {
  db,
  walletActivityTable,
  walletWatchesTable,
  type User,
} from "@workspace/db";
import { requireActiveUser } from "../middlewares/authorization";

const router: IRouter = Router();
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const chainConfig = {
  ethereum: {
    rpc: "https://ethereum-rpc.publicnode.com",
    asset: "ETH",
    explorer: "https://etherscan.io/tx/",
  },
  polygon: {
    rpc: "https://polygon-bor-rpc.publicnode.com",
    asset: "POL",
    explorer: "https://polygonscan.com/tx/",
  },
  avalanche: {
    rpc: "https://avalanche-c-chain-rpc.publicnode.com",
    asset: "AVAX",
    explorer: "https://snowtrace.io/tx/",
  },
} as const;
type WatchedNetwork = keyof typeof chainConfig | "solana";

function validAddress(network: WatchedNetwork, address: string): boolean {
  if (network === "solana") {
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  }
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

function evmTopicAddress(address: string): string {
  return `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
}

function formatUnits(value: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = (value % scale)
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

async function rpc<T>(
  url: string,
  method: string,
  params: unknown[],
): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`RPC returned HTTP ${response.status}`);
  const payload = (await response.json()) as {
    result?: T;
    error?: { message?: string };
  };
  if (payload.error || payload.result === undefined) {
    throw new Error(payload.error?.message ?? `RPC method ${method} failed`);
  }
  return payload.result;
}

async function saveActivity(input: typeof walletActivityTable.$inferInsert) {
  await db.insert(walletActivityTable).values(input).onConflictDoNothing();
}

async function pollEvm(watch: typeof walletWatchesTable.$inferSelect) {
  const config = chainConfig[watch.network as keyof typeof chainConfig];
  const latestHex = await rpc<string>(config.rpc, "eth_blockNumber", []);
  const latest = Number.parseInt(latestHex, 16);
  if (!Number.isSafeInteger(latest)) throw new Error("Provider returned an invalid block number");

  const previous = watch.lastCursor ? Number.parseInt(watch.lastCursor, 10) : null;
  const from = previous === null ? Math.max(0, latest - 12) : Math.max(previous + 1, latest - 500);
  if (from <= latest) {
    const addressTopic = evmTopicAddress(watch.address);
    const queries = [
      { fromBlock: `0x${from.toString(16)}`, toBlock: latestHex, topics: [TRANSFER_TOPIC, addressTopic] },
      { fromBlock: `0x${from.toString(16)}`, toBlock: latestHex, topics: [TRANSFER_TOPIC, null, addressTopic] },
    ];
    const logLists = await Promise.all(
      queries.map((filter) => rpc<Array<{
        address: string;
        data: string;
        topics: string[];
        transactionHash: string;
        logIndex: string;
        blockNumber: string;
      }>>(config.rpc, "eth_getLogs", [filter])),
    );
    const logs = new Map<string, (typeof logLists)[number][number]>();
    for (const log of logLists.flat()) {
      logs.set(`${log.transactionHash}:${log.logIndex}`, log);
    }
    for (const log of logs.values()) {
      // ERC-20 Transfer logs have three topics and a data value. ERC-721
      // transfers use a fourth indexed token-id topic, so are not mislabeled.
      if (log.topics.length !== 3 || !/^0x[0-9a-f]+$/i.test(log.data)) continue;
      const fromAddress = `0x${log.topics[1]?.slice(-40) ?? ""}`;
      const toAddress = `0x${log.topics[2]?.slice(-40) ?? ""}`;
      const outgoing = fromAddress.toLowerCase() === watch.address.toLowerCase();
      const amount = BigInt(log.data).toString();
      await saveActivity({
        watchId: watch.id,
        txHash: log.transactionHash,
        eventKey: log.logIndex,
        activityType: "token_transfer",
        direction: outgoing ? "out" : "in",
        asset: `ERC-20 ${log.address.slice(0, 8)}…${log.address.slice(-6)}`,
        amount,
        counterparty: outgoing ? toAddress : fromAddress,
        blockNumber: String(Number.parseInt(log.blockNumber, 16)),
        occurredAt: null,
        explorerUrl: `${config.explorer}${encodeURIComponent(log.transactionHash)}`,
      });
    }
  }
  await db.update(walletWatchesTable)
    .set({ lastCursor: String(latest), lastCheckedAt: new Date() })
    .where(eq(walletWatchesTable.id, watch.id));
}

type SolanaTokenBalance = {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount?: { amount?: string; decimals?: number };
};

async function pollSolana(watch: typeof walletWatchesTable.$inferSelect) {
  const rpcUrl = "https://api.mainnet-beta.solana.com";
  const signatures = await rpc<Array<{ signature: string; blockTime?: number | null }>>(
    rpcUrl,
    "getSignaturesForAddress",
    [watch.address, { limit: 20, commitment: "confirmed" }],
  );
  if (!signatures.length) {
    await db.update(walletWatchesTable)
      .set({ lastCheckedAt: new Date() })
      .where(eq(walletWatchesTable.id, watch.id));
    return;
  }

  const newSignatures: typeof signatures = [];
  for (const item of signatures) {
    if (item.signature === watch.lastCursor) break;
    newSignatures.push(item);
  }
  const toProcess = newSignatures.slice(0, 8);
  for (const item of toProcess) {
    const tx = await rpc<{
      transaction?: { message?: { accountKeys?: Array<string | { pubkey: string }> } };
      meta?: {
        preBalances?: number[];
        postBalances?: number[];
        preTokenBalances?: SolanaTokenBalance[];
        postTokenBalances?: SolanaTokenBalance[];
      } | null;
    } | null>(
      rpcUrl,
      "getTransaction",
      [item.signature, { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 }],
    );
    const meta = tx?.meta;
    const keys = tx?.transaction?.message?.accountKeys ?? [];
    const accountIndex = keys.findIndex((key) =>
      (typeof key === "string" ? key : key.pubkey) === watch.address,
    );
    if (meta && accountIndex >= 0) {
      const delta =
        (meta.postBalances?.[accountIndex] ?? 0) -
        (meta.preBalances?.[accountIndex] ?? 0);
      if (delta !== 0) {
        await saveActivity({
          watchId: watch.id,
          txHash: item.signature,
          eventKey: "sol-native",
          activityType: "native_transfer",
          direction: delta > 0 ? "in" : "out",
          asset: "SOL",
          amount: formatUnits(BigInt(Math.abs(delta)), 9),
          counterparty: null,
          blockNumber: null,
          occurredAt: item.blockTime ? new Date(item.blockTime * 1000) : null,
          explorerUrl: `https://solscan.io/tx/${encodeURIComponent(item.signature)}`,
        });
      }

      const balances = new Map<string, { before: bigint; after: bigint; decimals: number }>();
      for (const row of meta.preTokenBalances ?? []) {
        if (row.owner !== watch.address || !row.mint) continue;
        const current = balances.get(row.mint) ?? {
          before: 0n,
          after: 0n,
          decimals: row.uiTokenAmount?.decimals ?? 0,
        };
        current.before += BigInt(row.uiTokenAmount?.amount ?? "0");
        balances.set(row.mint, current);
      }
      for (const row of meta.postTokenBalances ?? []) {
        if (row.owner !== watch.address || !row.mint) continue;
        const current = balances.get(row.mint) ?? {
          before: 0n,
          after: 0n,
          decimals: row.uiTokenAmount?.decimals ?? 0,
        };
        current.after += BigInt(row.uiTokenAmount?.amount ?? "0");
        current.decimals = row.uiTokenAmount?.decimals ?? current.decimals;
        balances.set(row.mint, current);
      }
      for (const [mint, balance] of balances) {
        const change = balance.after - balance.before;
        if (change === 0n) continue;
        await saveActivity({
          watchId: watch.id,
          txHash: item.signature,
          eventKey: `spl-${mint}`,
          activityType: "token_transfer",
          direction: change > 0n ? "in" : "out",
          asset: `SPL ${mint.slice(0, 6)}…${mint.slice(-4)}`,
          amount: formatUnits(change < 0n ? -change : change, balance.decimals),
          counterparty: null,
          blockNumber: null,
          occurredAt: item.blockTime ? new Date(item.blockTime * 1000) : null,
          explorerUrl: `https://solscan.io/tx/${encodeURIComponent(item.signature)}`,
        });
      }
    }
  }
  await db.update(walletWatchesTable)
    .set({
      lastCursor: signatures[0]?.signature ?? watch.lastCursor,
      lastCheckedAt: new Date(),
    })
    .where(eq(walletWatchesTable.id, watch.id));
}

router.get("/watch/wallets", requireActiveUser, async (_req, res): Promise<void> => {
  const user = res.locals.currentUser as User;
  const watches = await db.select().from(walletWatchesTable)
    .where(eq(walletWatchesTable.clerkUserId, user.clerkUserId))
    .orderBy(desc(walletWatchesTable.createdAt));
  res.json(ListWalletWatchesResponse.parse(watches));
});

router.post("/watch/wallets", requireActiveUser, async (req, res): Promise<void> => {
  const parsed = CreateWalletWatchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const user = res.locals.currentUser as User;
  const { network, address, label } = parsed.data as {
    network: WatchedNetwork;
    address: string;
    label: string;
  };
  const normalizedAddress = network === "solana" ? address : address.toLowerCase();
  if (!validAddress(network, address)) {
    res.status(400).json({ error: "The address format does not match the selected chain." });
    return;
  }
  try {
    const [watch] = await db.insert(walletWatchesTable).values({
      clerkUserId: user.clerkUserId,
      network,
      address: normalizedAddress,
      label: label.trim(),
      alertsEnabled: parsed.data.alertsEnabled ?? true,
    }).returning();
    res.status(201).json(watch);
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      res.status(409).json({ error: "This address is already on your watchlist for that chain." });
      return;
    }
    req.log.error({ err: error }, "Could not create wallet watch");
    res.status(503).json({ error: "The wallet watch could not be saved." });
  }
});

router.delete("/watch/wallets", requireActiveUser, async (req, res): Promise<void> => {
  const query = DeleteWalletWatchQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const user = res.locals.currentUser as User;
  const deleted = await db.delete(walletWatchesTable).where(and(
    eq(walletWatchesTable.id, query.data.watchId),
    eq(walletWatchesTable.clerkUserId, user.clerkUserId),
  )).returning({ id: walletWatchesTable.id });
  if (!deleted.length) {
    res.status(404).json({ error: "Wallet watch was not found." });
    return;
  }
  res.status(204).end();
});

router.get("/watch/activity", requireActiveUser, async (req, res): Promise<void> => {
  const query = GetWalletWatchActivityQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const user = res.locals.currentUser as User;
  const [watch] = await db.select().from(walletWatchesTable)
    .where(eq(walletWatchesTable.id, query.data.watchId))
    .limit(1);
  if (!watch || (watch.clerkUserId !== user.clerkUserId && user.role !== "admin")) {
    res.status(404).json({ error: "Wallet watch was not found." });
    return;
  }
  try {
    if (watch.network === "solana") await pollSolana(watch);
    else await pollEvm(watch);
    const items = await db.select().from(walletActivityTable)
      .where(eq(walletActivityTable.watchId, watch.id))
      .orderBy(desc(walletActivityTable.createdAt))
      .limit(query.data.limit);
    res.json(GetWalletWatchActivityResponse.parse({
      items,
      checkedAt: new Date(),
      source: watch.network === "solana" ? "Solana Mainnet RPC" : "PublicNode RPC",
      notice: "Public RPC tracking reports recent token and native balance changes only. It does not reliably classify buys, sells, NFT transfers, staking, or older history.",
    }));
  } catch (error) {
    req.log.warn({ err: error, network: watch.network }, "Wallet activity provider unavailable");
    res.status(503).json({ error: "The public activity provider is temporarily unavailable. Existing saved activity is unchanged." });
  }
});

export default router;
