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
  { name: "BBC Middle East",      url: "https://feeds.bbci.co.uk/news/world/middle_east/rss.xml" },
  { name: "Al Jazeera",           url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { name: "Middle East Eye",      url: "https://www.middleeasteye.net/rss" },
  { name: "Defence Blog",         url: "https://defence-blog.com/feed/" },
];

// Keywords mirroring bot/config.py primary keywords
const PRIMARY_KEYWORDS = [
  "hormuz", "strait", "persian gulf", "gulf of oman", "red sea",
  "oil", "crude", "petroleum", "opec", "refinery", "pipeline",
  "tanker", "supertanker", "shipping lane", "vessel", "cargo ship",
  "irgc", "naval", "houthi", "blockade", "missile strike", "drone attack",
  "iran", "iranian",
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

  const parser = new Parser({ timeout: 7000, maxRedirects: 3 });

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

  const allItems = results
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .filter((item) => isRelevant(item.title + " " + item.snippet))
    .sort((a, b) => {
      // Sort by score desc, then by date desc
      if (b._score !== a._score) return b._score - a._score;
      return new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime();
    })
    .slice(0, 25)
    .map(({ _score: _s, ...item }) => item);

  res.status(200).json({ items: allItems, updatedAt: new Date().toISOString() });
}
