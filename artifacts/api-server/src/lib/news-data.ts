import { XMLParser } from "fast-xml-parser";

const CACHE_TTL_MS = 2 * 60_000;
const parser = new XMLParser({ ignoreAttributes: true, trimValues: true });

type FeedConfig = { provider: string; url: string };
type FeedItem = {
  title?: unknown;
  link?: unknown;
  pubDate?: unknown;
  published?: unknown;
  description?: unknown;
  summary?: unknown;
};
type NewsArticle = {
  title: string;
  url: string;
  source: string;
  publishedAt: string | null;
  summary: string;
};
type NewsProviderStatus = {
  provider: string;
  status: "available" | "unavailable";
  articleCount: number;
};
type NewsFeedResponse = {
  items: NewsArticle[];
  providers: NewsProviderStatus[];
  updatedAt: string;
  source: string;
};

const feeds: FeedConfig[] = [
  { provider: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
  { provider: "Cointelegraph", url: "https://cointelegraph.com/rss" },
  { provider: "Decrypt", url: "https://decrypt.co/feed" },
];

let cached: { expiresAt: number; value: NewsFeedResponse } | undefined;

function text(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function feedItems(xml: string): FeedItem[] {
  const parsed = parser.parse(xml) as {
    rss?: { channel?: { item?: FeedItem | FeedItem[] } };
    feed?: { entry?: FeedItem | FeedItem[] };
  };
  const sourceItems = parsed.rss?.channel?.item ?? parsed.feed?.entry ?? [];
  return Array.isArray(sourceItems) ? sourceItems : [sourceItems];
}

function toArticle(item: FeedItem, provider: string): NewsArticle | null {
  const title = text(item.title);
  const link = text(item.link);
  if (!title || !link) return null;

  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const rawDate = text(item.pubDate) || text(item.published);
  const timestamp = rawDate ? new Date(rawDate) : null;
  const publishedAt =
    timestamp && Number.isFinite(timestamp.getTime())
      ? timestamp.toISOString()
      : null;

  return {
    title: title.slice(0, 300),
    url: url.toString(),
    source: provider,
    publishedAt,
    summary: (text(item.description) || text(item.summary)).slice(0, 700),
  };
}

async function loadFeed(feed: FeedConfig): Promise<{
  items: NewsArticle[];
  status: NewsProviderStatus;
}> {
  try {
    const response = await fetch(feed.url, {
      headers: { accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const xml = await response.text();
    if (xml.length > 3_000_000) throw new Error("Feed response exceeded size limit");
    const items = feedItems(xml)
      .map((item) => toArticle(item, feed.provider))
      .filter((item): item is NewsArticle => item !== null);
    if (!items.length) throw new Error("Feed contained no readable articles");
    return {
      items,
      status: { provider: feed.provider, status: "available", articleCount: items.length },
    };
  } catch {
    return {
      items: [],
      status: { provider: feed.provider, status: "unavailable", articleCount: 0 },
    };
  }
}

export async function getLatestNews(): Promise<NewsFeedResponse> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const results = await Promise.all(feeds.map(loadFeed));
  const unique = new Map<string, NewsArticle>();
  for (const result of results) {
    for (const item of result.items) {
      const key = item.url.replace(/\/$/, "").toLowerCase();
      if (!unique.has(key)) unique.set(key, item);
    }
  }

  const items = [...unique.values()]
    .sort((a, b) => {
      const aTime = a.publishedAt ? Date.parse(a.publishedAt) : 0;
      const bTime = b.publishedAt ? Date.parse(b.publishedAt) : 0;
      return bTime - aTime;
    })
    .slice(0, 60);

  const value: NewsFeedResponse = {
    items,
    providers: results.map((result) => result.status),
    updatedAt: new Date().toISOString(),
    source: "CoinDesk, Cointelegraph, and Decrypt public RSS feeds",
  };
  const allUnavailable = value.providers.every((provider) => provider.status === "unavailable");
  cached = { expiresAt: Date.now() + (allUnavailable ? 20_000 : CACHE_TTL_MS), value };
  return value;
}
