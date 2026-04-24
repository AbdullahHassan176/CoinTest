import type { NextApiRequest, NextApiResponse } from "next";

export type ThreatLevel = 0 | 1 | 2 | 3;

export type ThreatData = {
  level: ThreatLevel;
  label: "LOW" | "ELEVATED" | "HIGH" | "CRITICAL";
  score: number;
  factors: string[];
  updatedAt: string;
};

// High-signal keywords that push threat level up
const CRITICAL_SIGNALS = [
  "blockade", "missile strike", "drone attack", "seized tanker",
  "explosion", "airstrike", "warship", "naval standoff", "war",
];

const HIGH_SIGNALS = [
  "irgc", "naval", "houthi", "military", "attack", "seized",
  "threat", "confrontation", "escalation", "sanctions", "nuclear",
];

const ELEVATED_SIGNALS = [
  "tension", "warning", "alert", "incident", "dispute",
  "vessel", "tanker", "patrol", "opec", "oil price",
];

function scoreText(text: string): { score: number; factors: string[] } {
  const lower = text.toLowerCase();
  const factors: string[] = [];
  let score = 0;

  for (const kw of CRITICAL_SIGNALS) {
    if (lower.includes(kw)) { score += 4; factors.push(kw); }
  }
  for (const kw of HIGH_SIGNALS) {
    if (lower.includes(kw)) { score += 2; factors.push(kw); }
  }
  for (const kw of ELEVATED_SIGNALS) {
    if (lower.includes(kw)) { score += 1; factors.push(kw); }
  }

  return { score, factors: [...new Set(factors)] };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ThreatData>
) {
  res.setHeader("Cache-Control", "s-maxage=180, stale-while-revalidate=60");

  // Pull recent news from our own news API to compute threat
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;

  let score = 0;
  const factors: string[] = [];

  try {
    const newsRes = await fetch(`${baseUrl}/api/monitor/news`);
    if (newsRes.ok) {
      const data = await newsRes.json();
      for (const item of data.items ?? []) {
        const { score: s, factors: f } = scoreText(item.title + " " + item.snippet);
        score += s;
        factors.push(...f);
      }
    }
  } catch {
    // If news fetch fails, return low level
  }

  const uniqueFactors = [...new Set(factors)].slice(0, 8);

  let level: ThreatLevel;
  let label: ThreatData["label"];

  if (score >= 40) {
    level = 3; label = "CRITICAL";
  } else if (score >= 20) {
    level = 2; label = "HIGH";
  } else if (score >= 8) {
    level = 1; label = "ELEVATED";
  } else {
    level = 0; label = "LOW";
  }

  res.status(200).json({
    level, label, score,
    factors: uniqueFactors,
    updatedAt: new Date().toISOString(),
  });
}
