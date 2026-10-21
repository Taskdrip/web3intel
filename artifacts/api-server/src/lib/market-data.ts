const COINGECKO_API = "https://api.coingecko.com/api/v3";
const SOURCE = "CoinGecko";
const CACHE_TTL_MS = 60_000;

type CacheEntry<T> = { expiresAt: number; value: T };

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.value as T;
}

function setCached<T>(key: string, value: T): T {
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return value;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Market provider returned HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

export type MarketCoin = {
  id: string;
  symbol: string;
  name: string;
  image: string;
  currentPriceUsd: number;
  marketCapUsd: number;
  marketCapRank: number;
  volume24hUsd: number;
  change24hPercent: number;
  sparkline7d: number[];
  updatedAt: string;
};

export type MarketCoinsResponse = {
  items: MarketCoin[];
  updatedAt: string;
  source: string;
};

type CoinGeckoCoin = {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  total_volume: number;
  price_change_percentage_24h: number | null;
  sparkline_in_7d?: { price?: number[] };
};

export async function getMarketCoins(limit: number): Promise<MarketCoinsResponse> {
  const key = `coins:${limit}`;
  const cached = getCached<MarketCoinsResponse>(key);
  if (cached) return cached;

  const params = new URLSearchParams({
    vs_currency: "usd",
    order: "market_cap_desc",
    per_page: String(limit),
    page: "1",
    sparkline: "true",
    price_change_percentage: "24h",
  });
  const rows = await fetchJson<CoinGeckoCoin[]>(
    `${COINGECKO_API}/coins/markets?${params.toString()}`,
  );
  const updatedAt = new Date().toISOString();
  const items = rows.map((coin) => {
    const requiredNumbers = [
      coin.current_price,
      coin.market_cap,
      coin.market_cap_rank,
      coin.total_volume,
      coin.price_change_percentage_24h,
    ];
    if (
      !coin.id ||
      !coin.name ||
      !coin.symbol ||
      !coin.image ||
      requiredNumbers.some((value) => typeof value !== "number" || !Number.isFinite(value))
    ) {
      throw new Error("Market provider returned incomplete coin data");
    }

    return {
      id: coin.id,
      symbol: coin.symbol.toUpperCase(),
      name: coin.name,
      image: coin.image,
      currentPriceUsd: coin.current_price,
      marketCapUsd: coin.market_cap,
      marketCapRank: coin.market_cap_rank,
      volume24hUsd: coin.total_volume,
      change24hPercent: coin.price_change_percentage_24h as number,
      sparkline7d: coin.sparkline_in_7d?.price ?? [],
      updatedAt,
    };
  });

  return setCached(key, { items, updatedAt, source: SOURCE });
}

type CoinGeckoGlobal = {
  data?: {
    active_cryptocurrencies?: number;
    total_market_cap?: { usd?: number };
    total_volume?: { usd?: number };
    market_cap_percentage?: { btc?: number };
    market_cap_change_percentage_24h_usd?: number;
  };
};

export type MarketOverview = {
  totalMarketCapUsd: number;
  totalVolume24hUsd: number;
  bitcoinDominancePercent: number;
  activeCryptocurrencies: number;
  marketCapChange24hPercent: number;
  updatedAt: string;
  source: string;
};

export async function getMarketOverview(): Promise<MarketOverview> {
  const cached = getCached<MarketOverview>("overview");
  if (cached) return cached;

  const result = await fetchJson<CoinGeckoGlobal>(`${COINGECKO_API}/global`);
  const data = result.data;
  const totalMarketCapUsd = data?.total_market_cap?.usd;
  const totalVolume24hUsd = data?.total_volume?.usd;
  const bitcoinDominancePercent = data?.market_cap_percentage?.btc;
  const activeCryptocurrencies = data?.active_cryptocurrencies;
  const marketCapChange24hPercent = data?.market_cap_change_percentage_24h_usd;

  if (
    typeof totalMarketCapUsd !== "number" ||
    typeof totalVolume24hUsd !== "number" ||
    typeof bitcoinDominancePercent !== "number" ||
    typeof activeCryptocurrencies !== "number" ||
    typeof marketCapChange24hPercent !== "number"
  ) {
    throw new Error("Market provider returned incomplete global metrics");
  }

  return setCached("overview", {
    totalMarketCapUsd,
    totalVolume24hUsd,
    bitcoinDominancePercent,
    activeCryptocurrencies,
    marketCapChange24hPercent,
    updatedAt: new Date().toISOString(),
    source: SOURCE,
  });
}

type CoinGeckoHistory = { prices?: [number, number][] };

export async function getMarketHistory(
  coinId: string,
  days: string,
): Promise<{
  coinId: string;
  days: string;
  points: { timestamp: number; priceUsd: number }[];
  updatedAt: string;
  source: string;
}> {
  if (!/^[a-z0-9-]{1,80}$/i.test(coinId)) {
    throw new Error("Invalid cryptocurrency identifier");
  }

  const key = `history:${coinId}:${days}`;
  const cached = getCached<{
    coinId: string;
    days: string;
    points: { timestamp: number; priceUsd: number }[];
    updatedAt: string;
    source: string;
  }>(key);
  if (cached) return cached;

  const params = new URLSearchParams({ vs_currency: "usd", days });
  const history = await fetchJson<CoinGeckoHistory>(
    `${COINGECKO_API}/coins/${encodeURIComponent(coinId)}/market_chart?${params.toString()}`,
  );
  if (!Array.isArray(history.prices)) {
    throw new Error("Market provider returned incomplete history");
  }
  const points = history.prices.flatMap(([timestamp, priceUsd]) =>
    Number.isFinite(timestamp) && Number.isFinite(priceUsd)
      ? [{ timestamp, priceUsd }]
      : [],
  );
  return setCached(key, {
    coinId,
    days,
    points,
    updatedAt: new Date().toISOString(),
    source: SOURCE,
  });
}

