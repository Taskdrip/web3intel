import { Router, type IRouter } from "express";
import { ScanWalletBody, ScanWalletResponse } from "@workspace/api-zod";

const router: IRouter = Router();

type WalletNetwork =
  | "bitcoin"
  | "ethereum"
  | "solana"
  | "polygon"
  | "tron"
  | "avalanche"
  | "ton"
  | "sui";

type WalletScanResult = {
  network: WalletNetwork;
  address: string;
  status: "ok" | "invalid" | "unsupported" | "unavailable";
  nativeAsset: string | null;
  nativeBalance: string | null;
  explorerUrl: string;
  source: string | null;
  checkedAt: string;
  message: string;
};

const networkDetails: Record<
  WalletNetwork,
  { asset: string; explorer: string; rpc?: string }
> = {
  bitcoin: {
    asset: "BTC",
    explorer: "https://mempool.space/address/",
  },
  ethereum: {
    asset: "ETH",
    explorer: "https://etherscan.io/address/",
    rpc: "https://ethereum-rpc.publicnode.com",
  },
  solana: {
    asset: "SOL",
    explorer: "https://solscan.io/account/",
  },
  polygon: {
    asset: "POL",
    explorer: "https://polygonscan.com/address/",
    rpc: "https://polygon-bor-rpc.publicnode.com",
  },
  tron: {
    asset: "TRX",
    explorer: "https://tronscan.org/#/address/",
  },
  avalanche: {
    asset: "AVAX",
    explorer: "https://subnets.avax.network/c-chain/address/",
    rpc: "https://avalanche-c-chain-rpc.publicnode.com",
  },
  ton: {
    asset: "TON",
    explorer: "https://tonviewer.com/",
  },
  sui: {
    asset: "SUI",
    explorer: "https://suiscan.xyz/mainnet/account/",
  },
};

function isValidAddress(network: WalletNetwork, address: string): boolean {
  if (network === "ethereum" || network === "polygon" || network === "avalanche") {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }
  if (network === "bitcoin") {
    return /^(?:bc1[a-zA-HJ-NP-Z0-9]{25,89}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(
      address,
    );
  }
  if (network === "solana") {
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  }
  if (network === "tron") {
    return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address);
  }
  if (network === "ton") {
    return /^(?:[EU]Q[A-Za-z0-9_-]{46}|0:[a-fA-F0-9]{64})$/.test(address);
  }
  return /^0x[a-fA-F0-9]{64}$/.test(address);
}

function formatBaseUnits(value: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fractional = (value % base)
    .toString()
    .padStart(decimals, "0")
    .slice(0, 8)
    .replace(/0+$/, "");
  return fractional ? `${whole}.${fractional}` : whole.toString();
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    headers: { accept: "application/json", ...init?.headers },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Blockchain provider returned HTTP ${response.status}`);
  }
  return response.json();
}

async function readEvmBalance(rpc: string, address: string): Promise<string> {
  const data = (await fetchJson(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_getBalance",
      params: [address, "latest"],
      id: 1,
    }),
  })) as { result?: string; error?: { message?: string } };
  if (data.error || !data.result || !/^0x[0-9a-f]+$/i.test(data.result)) {
    throw new Error(data.error?.message ?? "Blockchain provider returned an invalid balance");
  }
  return formatBaseUnits(BigInt(data.result), 18);
}

async function readBitcoinBalance(address: string): Promise<string> {
  const data = (await fetchJson(
    `https://mempool.space/api/address/${encodeURIComponent(address)}`,
  )) as {
    chain_stats?: { funded_txo_sum?: number; spent_txo_sum?: number };
    mempool_stats?: { funded_txo_sum?: number; spent_txo_sum?: number };
  };
  const confirmed =
    (data.chain_stats?.funded_txo_sum ?? 0) -
    (data.chain_stats?.spent_txo_sum ?? 0);
  const pending =
    (data.mempool_stats?.funded_txo_sum ?? 0) -
    (data.mempool_stats?.spent_txo_sum ?? 0);
  if (!Number.isSafeInteger(confirmed) || !Number.isSafeInteger(pending)) {
    throw new Error("Blockchain provider returned an invalid balance");
  }
  const satoshis = BigInt(confirmed + pending);
  return formatBaseUnits(satoshis, 8);
}

async function readSolanaBalance(address: string): Promise<string> {
  const data = (await fetchJson("https://api.mainnet-beta.solana.com", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getBalance",
      params: [address, { commitment: "confirmed" }],
    }),
  })) as { result?: { value?: number }; error?: { message?: string } };
  const lamports = data.result?.value;
  if (data.error || typeof lamports !== "number" || !Number.isSafeInteger(lamports)) {
    throw new Error(data.error?.message ?? "Blockchain provider returned an invalid balance");
  }
  return formatBaseUnits(BigInt(lamports), 9);
}

function makeResult(
  network: WalletNetwork,
  address: string,
  status: WalletScanResult["status"],
  nativeBalance: string | null,
  source: string | null,
  message: string,
): WalletScanResult {
  const details = networkDetails[network];
  return {
    network,
    address,
    status,
    nativeAsset: details.asset,
    nativeBalance,
    explorerUrl: `${details.explorer}${encodeURIComponent(address)}`,
    source,
    checkedAt: new Date().toISOString(),
    message,
  };
}

router.post("/wallet/scan", async (req, res): Promise<void> => {
  const body = ScanWalletBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const { network, address } = body.data as {
    network: WalletNetwork;
    address: string;
  };
  if (!isValidAddress(network, address)) {
    res.json(
      ScanWalletResponse.parse(
        makeResult(network, address, "invalid", null, null, "The address format does not match this network."),
      ),
    );
    return;
  }

  const details = networkDetails[network];
  if (network === "tron" || network === "ton" || network === "sui") {
    res.json(
      ScanWalletResponse.parse(
        makeResult(
          network,
          address,
          "unsupported",
          null,
          null,
          "Address format is valid, but a balance provider is not connected for this network yet.",
        ),
      ),
    );
    return;
  }

  try {
    const balance =
      network === "bitcoin"
        ? await readBitcoinBalance(address)
        : network === "solana"
          ? await readSolanaBalance(address)
          : await readEvmBalance(details.rpc!, address);
    res.json(
      ScanWalletResponse.parse(
        makeResult(
          network,
          address,
          "ok",
          balance,
          network === "bitcoin"
            ? "mempool.space"
            : network === "solana"
              ? "Solana Mainnet RPC"
              : "PublicNode RPC",
          "Read-only native-token balance. Token and NFT holdings are not included.",
        ),
      ),
    );
  } catch (error) {
    req.log.warn({ err: error, network }, "Wallet balance provider unavailable");
    res
      .status(503)
      .json(
        ScanWalletResponse.parse(
          makeResult(
            network,
            address,
            "unavailable",
            null,
            null,
            "The public balance provider is temporarily unavailable. No wallet data was saved.",
          ),
        ),
      );
  }
});

export default router;

