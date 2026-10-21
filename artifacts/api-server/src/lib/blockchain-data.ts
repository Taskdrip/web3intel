type NetworkName =
  | "bitcoin"
  | "ethereum"
  | "polygon"
  | "avalanche"
  | "base"
  | "arbitrum"
  | "solana";
type NetworkFamily = "bitcoin" | "evm" | "solana";
type NetworkStatus = {
  network: NetworkName;
  name: string;
  family: NetworkFamily;
  status: "available" | "unavailable";
  latestHeight: string | null;
  blockTime: string | null;
  gasPriceGwei: number | null;
  epoch: string | null;
  source: string;
  checkedAt: string;
  error: string | null;
};
type NetworkStatusResponse = {
  networks: NetworkStatus[];
  updatedAt: string;
  source: string;
};

const evmNetworks = [
  {
    network: "ethereum",
    name: "Ethereum",
    rpc: "https://ethereum-rpc.publicnode.com",
    source: "PublicNode",
  },
  {
    network: "polygon",
    name: "Polygon",
    rpc: "https://polygon-bor-rpc.publicnode.com",
    source: "PublicNode",
  },
  {
    network: "avalanche",
    name: "Avalanche",
    rpc: "https://avalanche-c-chain-rpc.publicnode.com",
    source: "PublicNode",
  },
  {
    network: "base",
    name: "Base",
    rpc: "https://base-rpc.publicnode.com",
    source: "PublicNode",
  },
  {
    network: "arbitrum",
    name: "Arbitrum",
    rpc: "https://arbitrum-one-rpc.publicnode.com",
    source: "PublicNode",
  },
] as const;

async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(10_000),
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

function unavailable(
  network: NetworkName,
  name: string,
  family: NetworkFamily,
  source: string,
  checkedAt: string,
): NetworkStatus {
  return {
    network,
    name,
    family,
    status: "unavailable",
    latestHeight: null,
    blockTime: null,
    gasPriceGwei: null,
    epoch: null,
    source,
    checkedAt,
    error: "Public provider did not return a usable response.",
  };
}

async function getEvmStatus(
  config: (typeof evmNetworks)[number],
  checkedAt: string,
): Promise<NetworkStatus> {
  try {
    const [block, gasHex] = await Promise.all([
      rpc<{ number?: string; timestamp?: string }>(
        config.rpc,
        "eth_getBlockByNumber",
        ["latest", false],
      ),
      rpc<string>(config.rpc, "eth_gasPrice", []),
    ]);
    const height = Number.parseInt(block.number ?? "", 16);
    const blockSeconds = Number.parseInt(block.timestamp ?? "", 16);
    const gasWei = BigInt(gasHex);
    if (!Number.isSafeInteger(height) || !Number.isFinite(blockSeconds)) {
      throw new Error("Provider returned incomplete block metadata");
    }
    const gasPriceGwei = Number(gasWei) / 1e9;
    return {
      network: config.network,
      name: config.name,
      family: "evm",
      status: "available",
      latestHeight: String(height),
      blockTime: new Date(blockSeconds * 1000).toISOString(),
      gasPriceGwei: Number.isFinite(gasPriceGwei) ? gasPriceGwei : null,
      epoch: null,
      source: config.source,
      checkedAt,
      error: null,
    };
  } catch {
    return unavailable(config.network, config.name, "evm", config.source, checkedAt);
  }
}

async function getBitcoinStatus(checkedAt: string): Promise<NetworkStatus> {
  const network = "bitcoin";
  const name = "Bitcoin";
  const source = "mempool.space";
  try {
    const response = await fetch("https://mempool.space/api/blocks/tip/height", {
      headers: { accept: "text/plain" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const height = (await response.text()).trim();
    if (!/^\d+$/.test(height)) throw new Error("Invalid block height");
    return {
      network,
      name,
      family: "bitcoin",
      status: "available",
      latestHeight: height,
      blockTime: null,
      gasPriceGwei: null,
      epoch: null,
      source,
      checkedAt,
      error: null,
    };
  } catch {
    return unavailable(network, name, "bitcoin", source, checkedAt);
  }
}

async function getSolanaStatus(checkedAt: string): Promise<NetworkStatus> {
  const network = "solana";
  const name = "Solana";
  const source = "Solana Mainnet RPC";
  const rpcUrl = "https://api.mainnet-beta.solana.com";
  try {
    const [slot, epochInfo] = await Promise.all([
      rpc<number>(rpcUrl, "getSlot", [{ commitment: "confirmed" }]),
      rpc<{ epoch?: number }>(rpcUrl, "getEpochInfo", [{ commitment: "confirmed" }]),
    ]);
    if (!Number.isSafeInteger(slot)) throw new Error("Invalid slot");
    return {
      network,
      name,
      family: "solana",
      status: "available",
      latestHeight: String(slot),
      blockTime: null,
      gasPriceGwei: null,
      epoch: epochInfo.epoch === undefined ? null : String(epochInfo.epoch),
      source,
      checkedAt,
      error: null,
    };
  } catch {
    return unavailable(network, name, "solana", source, checkedAt);
  }
}

export async function getBlockchainStatus(): Promise<NetworkStatusResponse> {
  const checkedAt = new Date().toISOString();
  const networks = await Promise.all([
    getBitcoinStatus(checkedAt),
    ...evmNetworks.map((config) => getEvmStatus(config, checkedAt)),
    getSolanaStatus(checkedAt),
  ]);
  return {
    networks,
    updatedAt: checkedAt,
    source: "PublicNode, mempool.space, and Solana Mainnet RPC",
  };
}
