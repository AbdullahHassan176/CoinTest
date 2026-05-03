import type { NextApiRequest, NextApiResponse } from "next";
import Parser from "rss-parser";

export type NewsItem = {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  snippet: string;
};

export type NewsData = {
  items: NewsItem[];
  updatedAt: string;
};

const FEEDS: Array<{ name: string; url: string }> = [
  { name: "Reuters World",        url: "https://feeds.reuters.com/reuters/worldNews" },
  { name: "BBC World",            url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { name: "BBC Middle East",      url: "https://feeds.bbci.co.uk/news/world/middle_east/rss.xml" },
  { name: "Al Jazeera",           url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { name: "Middle East Eye",      url: "https://www.middleeasteye.net/rss" },
  { name: "Defence Blog",         url: "https://defence-blog.com/feed/" },
  { name: "Guardian World",       url: "https://www.theguardian.com/world/rss" },
];

// Primary scan (strait + energy + security) — used for ranking + first pass
const PRIMARY_KEYWORDS = [
  "hormuz", "strait", "persian gulf", "gulf of oman", "red sea", "suez", "panama", "malacca",
  "oil", "crude", "petroleum", "opec", "refinery", "pipeline", "lng",
  "tanker", "supertanker", "shipping lane", "vessel", "cargo ship", "maritime", "port", "canal", "freight",
  "irgc", "naval", "houthi", "blockade", "missile strike", "drone attack",
  "iran", "iranian", "sanction", "export", "import", "trade",
];

function isRelevant(text: string): boolean {
  const lower = text.toLowerCase();
  return PRIMARY_KEYWORDS.some((kw) => lower.includes(kw));
}

function scoreItem(text: string): number {
  const lower = text.toLowerCase();
  return PRIMARY_KEYWORDS.reduce((acc, kw) => acc + (lower.includes(kw) ? 2 : 0), 0);
}

export default async function handler(
  _req: NextApiRequest,
  res: NextApiResponse<NewsData>
) {
  res.setHeader("Cache-Control", "s-maxage=180, stale-while-revalidate=60");

  const parser = new Parser({
    timeout: 14_000,
    maxRedirects: 4,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      Accept: "application/rss+xml, application/xml, text/xml, */*",
    },
  });

  const results = await Promise.allSettled(
    FEEDS.map(async (feed) => {
      const parsed = await parser.parseURL(feed.url);
      return (parsed.items ?? []).map((item) => ({
        title:   item.title ?? "",
        link:    item.link ?? "",
        pubDate: item.pubDate ?? item.isoDate ?? "",
        source:  feed.name,
        snippet: item.contentSnippet?.slice(0, 200) ?? item.content?.slice(0, 200) ?? "",
        _score:  scoreItem((item.title ?? "") + " " + (item.contentSnippet ?? "")),
      }));
    })
  );

  type Raw = {
    title: string;
    link: string;
    pubDate: string;
    source: string;
    snippet: string;
    _score: number;
  };

  const pool = results.flatMap((r) => (r.status === "fulfilled" ? r.value : [])) as Raw[];

  const scored = pool.map((item) => {
    const blob = `${item.title} ${item.snippet}`;
    return { ...item, _rel: isRelevant(blob) };
  });

  const byPriority = (a: Raw & { _rel: boolean }, b: Raw & { _rel: boolean }) => {
    if (a._rel !== b._rel) return a._rel ? -1 : 1;
    if (b._score !== a._score) return b._score - a._score;
    return new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime();
  };

  scored.sort(byPriority);

  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (const row of scored) {
    const key = row.link || row.title;
    if (seen.has(key)) continue;
    seen.add(key);
    const { _score: _s, _rel: _r, ...item } = row;
    out.push(item);
    if (out.length >= 25) break;
  }

  res.status(200).json({ items: out, updatedAt: new Date().toISOString() });
}
