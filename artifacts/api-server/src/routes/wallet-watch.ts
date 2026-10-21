import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  CreateWalletWatchBody,
  DeleteWalletWatchQueryParams,
  GetWalletWatchActivityQueryParams,
  GetWalletWatchActivityResponse,
  ListWalletWatchesResponse,
  UpdateWalletWatchBody,
  UpdateWalletWatchParams,
  UpdateWalletWatchResponse,
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
const ERC1155_SINGLE_TOPIC =
  "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62";
const ERC1155_BATCH_TOPIC =
  "0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb";

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
  base: {
    rpc: "https://base-rpc.publicnode.com",
    asset: "ETH",
    explorer: "https://basescan.org/tx/",
  },
  arbitrum: {
    rpc: "https://arbitrum-one-rpc.publicnode.com",
    asset: "ETH",
    explorer: "https://arbiscan.io/tx/",
  },
} as const;
type WatchedNetwork = keyof typeof chainConfig | "solana";

export function isValidWatchAddress(network: string, address: string): boolean {
  if (network === "solana") {
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  }
  return ["ethereum", "polygon", "avalanche", "base", "arbitrum"].includes(network) &&
    /^0x[a-fA-F0-9]{40}$/.test(address);
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

function decodeAbiString(value: string): string | null {
  if (!/^0x[0-9a-f]*$/i.test(value)) return null;
  const data = value.slice(2);
  if (data.length < 64) return null;

  try {
    const offset = Number(BigInt(`0x${data.slice(0, 64)}`)) * 2;
    if (Number.isSafeInteger(offset) && offset + 64 <= data.length) {
      const byteLength = Number(BigInt(`0x${data.slice(offset, offset + 64)}`));
      const start = offset + 64;
      if (Number.isSafeInteger(byteLength) && byteLength <= 64 && start + byteLength * 2 <= data.length) {
        const decoded = Buffer.from(data.slice(start, start + byteLength * 2), "hex").toString("utf8");
        if (decoded) return decoded;
      }
    }
  } catch {
    // Some older tokens return a bytes32 symbol rather than ABI-encoded string.
  }

  const bytes32 = Buffer.from(data.slice(0, 64), "hex").toString("utf8").replace(/\0.*$/s, "");
  return bytes32 || null;
}

type TokenMetadata = { symbol: string; decimals: number | null };
const tokenMetadataCache = new Map<string, Promise<TokenMetadata>>();

async function getTokenMetadata(rpcUrl: string, contract: string): Promise<TokenMetadata> {
  const cacheKey = `${rpcUrl}:${contract.toLowerCase()}`;
  const cached = tokenMetadataCache.get(cacheKey);
  if (cached) return cached;

  const metadataPromise = (async (): Promise<TokenMetadata> => {
    const [symbolResult, decimalsResult] = await Promise.allSettled([
      rpc<string>(rpcUrl, "eth_call", [{ to: contract, data: "0x95d89b41" }, "latest"]),
      rpc<string>(rpcUrl, "eth_call", [{ to: contract, data: "0x313ce567" }, "latest"]),
    ]);
    const decodedSymbol = symbolResult.status === "fulfilled"
      ? decodeAbiString(symbolResult.value)
      : null;
    const symbol = (decodedSymbol ?? `${contract.slice(0, 8)}…${contract.slice(-6)}`)
      .replace(/[^\p{L}\p{N}._-]/gu, "")
      .slice(0, 16) || `${contract.slice(0, 8)}…${contract.slice(-6)}`;
    let decimals: number | null = null;
    if (decimalsResult.status === "fulfilled" && /^0x[0-9a-f]+$/i.test(decimalsResult.value)) {
      const parsed = Number(BigInt(decimalsResult.value));
      if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 36) decimals = parsed;
    }
    return { symbol, decimals };
  })();

  tokenMetadataCache.set(cacheKey, metadataPromise);
  if (tokenMetadataCache.size > 500) {
    const oldestKey = tokenMetadataCache.keys().next().value;
    if (oldestKey) tokenMetadataCache.delete(oldestKey);
  }
  try {
    return await metadataPromise;
  } catch (error) {
    tokenMetadataCache.delete(cacheKey);
    throw error;
  }
}

function uintWord(data: string, wordIndex: number): bigint | null {
  const start = wordIndex * 64;
  const word = data.slice(start, start + 64);
  if (!/^[0-9a-f]{64}$/i.test(word)) return null;
  return BigInt(`0x${word}`);
}

function decodeUintArray(data: string, offset: bigint): bigint[] | null {
  if (offset > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  const start = Number(offset) * 2;
  if (!Number.isSafeInteger(start) || start + 64 > data.length) return null;
  const count = Number(BigInt(`0x${data.slice(start, start + 64)}`));
  if (!Number.isSafeInteger(count) || count < 0 || count > 100) return null;
  const values: bigint[] = [];
  for (let i = 0; i < count; i++) {
    const wordStart = start + 64 + i * 64;
    const word = data.slice(wordStart, wordStart + 64);
    if (!/^[0-9a-f]{64}$/i.test(word)) return null;
    values.push(BigInt(`0x${word}`));
  }
  return values;
}

async function pollEvm(watch: typeof walletWatchesTable.$inferSelect) {
  const config = chainConfig[watch.network as keyof typeof chainConfig];
  const latestHex = await rpc<string>(config.rpc, "eth_blockNumber", []);
  const latest = Number.parseInt(latestHex, 16);
  if (!Number.isSafeInteger(latest)) throw new Error("Provider returned an invalid block number");

  const previous = watch.lastCursor ? Number.parseInt(watch.lastCursor, 10) : null;
  const from = previous === null || previous > latest
    ? Math.max(0, latest - 12)
    : previous + 1;
  const to = Math.min(latest, from + 499);
  if (from <= latest) {
    const addressTopic = evmTopicAddress(watch.address);
    const queries = [
      { fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}`, topics: [TRANSFER_TOPIC, addressTopic] },
      { fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}`, topics: [TRANSFER_TOPIC, null, addressTopic] },
      { fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}`, topics: [ERC1155_SINGLE_TOPIC, null, addressTopic] },
      { fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}`, topics: [ERC1155_SINGLE_TOPIC, null, null, addressTopic] },
      { fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}`, topics: [ERC1155_BATCH_TOPIC, null, addressTopic] },
      { fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}`, topics: [ERC1155_BATCH_TOPIC, null, null, addressTopic] },
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
      if (!/^0x[0-9a-f]*$/i.test(log.data)) continue;
      if (log.topics[0]?.toLowerCase() === TRANSFER_TOPIC && log.topics.length === 4 &&
          /^0x[0-9a-f]{64}$/i.test(log.topics[3] ?? "")) {
        const fromAddress = `0x${log.topics[1]?.slice(-40) ?? ""}`;
        const toAddress = `0x${log.topics[2]?.slice(-40) ?? ""}`;
        const outgoing = fromAddress.toLowerCase() === watch.address.toLowerCase();
        const tokenId = BigInt(log.topics[3]!).toString();
        await saveActivity({
          watchId: watch.id,
          txHash: log.transactionHash,
          eventKey: log.logIndex,
          activityType: "nft_transfer",
          direction: outgoing ? "out" : "in",
          asset: `ERC-721 ${log.address.slice(0, 8)}…${log.address.slice(-6)} #${tokenId}`,
          amount: "1",
          counterparty: outgoing ? toAddress : fromAddress,
          blockNumber: String(Number.parseInt(log.blockNumber, 16)),
          occurredAt: null,
          explorerUrl: `${config.explorer}${encodeURIComponent(log.transactionHash)}`,
        });
        continue;
      }
      if (log.topics[0]?.toLowerCase() === TRANSFER_TOPIC && log.topics.length === 3 &&
          /^0x[0-9a-f]{64}$/i.test(log.data)) {
        const fromAddress = `0x${log.topics[1]?.slice(-40) ?? ""}`;
        const toAddress = `0x${log.topics[2]?.slice(-40) ?? ""}`;
        const outgoing = fromAddress.toLowerCase() === watch.address.toLowerCase();
        const rawAmount = BigInt(log.data).toString();
        let amount = rawAmount;
        let asset = `ERC-20 ${log.address.slice(0, 8)}…${log.address.slice(-6)}`;
        try {
          const metadata = await getTokenMetadata(config.rpc, log.address);
          asset = `ERC-20 ${metadata.symbol}`;
          if (metadata.decimals !== null) amount = formatUnits(BigInt(rawAmount), metadata.decimals);
        } catch {
          // Keep the observed transfer visible if a token's optional metadata methods fail.
        }
        await saveActivity({
          watchId: watch.id,
          txHash: log.transactionHash,
          eventKey: log.logIndex,
          activityType: "token_transfer",
          direction: outgoing ? "out" : "in",
          asset,
          amount,
          counterparty: outgoing ? toAddress : fromAddress,
          blockNumber: String(Number.parseInt(log.blockNumber, 16)),
          occurredAt: null,
          explorerUrl: `${config.explorer}${encodeURIComponent(log.transactionHash)}`,
        });
        continue;
      }

      const topic = log.topics[0]?.toLowerCase();
      if ((topic === ERC1155_SINGLE_TOPIC || topic === ERC1155_BATCH_TOPIC) && log.topics.length === 4) {
        const fromAddress = `0x${log.topics[2]?.slice(-40) ?? ""}`;
        const toAddress = `0x${log.topics[3]?.slice(-40) ?? ""}`;
        const outgoing = fromAddress.toLowerCase() === watch.address.toLowerCase();
        const data = log.data.slice(2);
        let transfers: Array<{ tokenId: bigint; amount: bigint }> = [];
        if (topic === ERC1155_SINGLE_TOPIC) {
          const tokenId = uintWord(data, 0);
          const amount = uintWord(data, 1);
          if (tokenId !== null && amount !== null) transfers = [{ tokenId, amount }];
        } else {
          const idsOffset = uintWord(data, 0);
          const valuesOffset = uintWord(data, 1);
          const ids = idsOffset === null ? null : decodeUintArray(data, idsOffset);
          const amounts = valuesOffset === null ? null : decodeUintArray(data, valuesOffset);
          if (ids && amounts && ids.length === amounts.length) {
            transfers = ids.map((tokenId, index) => ({ tokenId, amount: amounts[index] ?? 0n }));
          }
        }
        for (let index = 0; index < transfers.length; index++) {
          const transfer = transfers[index]!;
          await saveActivity({
            watchId: watch.id,
            txHash: log.transactionHash,
            eventKey: `${log.logIndex}:${index}`,
            activityType: "nft_transfer",
            direction: outgoing ? "out" : "in",
            asset: `ERC-1155 ${log.address.slice(0, 8)}…${log.address.slice(-6)} #${transfer.tokenId}`,
            amount: transfer.amount.toString(),
            counterparty: outgoing ? toAddress : fromAddress,
            blockNumber: String(Number.parseInt(log.blockNumber, 16)),
            occurredAt: null,
            explorerUrl: `${config.explorer}${encodeURIComponent(log.transactionHash)}`,
          });
        }
      }
    }
  }
  await db.update(walletWatchesTable)
    .set({ lastCursor: String(from <= latest ? to : previous ?? latest), lastCheckedAt: new Date() })
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
  // RPC signatures arrive newest-first. Process the oldest unseen batch first
  // so a busy wallet can catch up without jumping its cursor over transactions.
  const toProcess = newSignatures.slice(-8);
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
      lastCursor: toProcess[0]?.signature ?? watch.lastCursor,
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
  if (!isValidWatchAddress(network, address)) {
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

router.patch("/watch/wallets/:watchId", requireActiveUser, async (req, res): Promise<void> => {
  const params = UpdateWalletWatchParams.safeParse(req.params);
  const body = UpdateWalletWatchBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: params.error?.message ?? body.error?.message ?? "Invalid wallet watch update." });
    return;
  }
  const user = res.locals.currentUser as User;
  const update = { ...body.data };
  if (update.label !== undefined) {
    update.label = update.label.trim();
    if (!update.label) {
      res.status(400).json({ error: "The wallet label cannot be empty." });
      return;
    }
  }
  const [updated] = await db.update(walletWatchesTable)
    .set(update)
    .where(and(
      eq(walletWatchesTable.id, params.data.watchId),
      eq(walletWatchesTable.clerkUserId, user.clerkUserId),
    ))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Wallet watch was not found." });
    return;
  }
  res.json(UpdateWalletWatchResponse.parse(updated));
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
