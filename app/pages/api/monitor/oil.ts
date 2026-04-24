import type { NextApiRequest, NextApiResponse } from "next";
import YahooFinanceClass from "yahoo-finance2";
// yahoo-finance2 v3 exports a class — instantiate it
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yahooFinance = new (YahooFinanceClass as any)({ suppressNotices: ["yahooSurvey"] });

export type OilData = {
  brent: { price: number; change: number; changePct: number } | null;
  wti:   { price: number; change: number; changePct: number } | null;
  ng:    { price: number; change: number; changePct: number } | null;
  updatedAt: string;
};

async function fetchQuote(symbol: string) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = await yahooFinance.quote(symbol) as any;
    return {
      price:     (q.regularMarketPrice     as number) ?? 0,
      change:    (q.regularMarketChange    as number) ?? 0,
      changePct: (q.regularMarketChangePercent as number) ?? 0,
    };
  } catch {
    return null;
  }
}

export default async function handler(
  _req: NextApiRequest,
  res: NextApiResponse<OilData>
) {
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=60");

  const [brent, wti, ng] = await Promise.all([
    fetchQuote("BZ=F"),  // Brent crude
    fetchQuote("CL=F"),  // WTI crude
    fetchQuote("NG=F"),  // Natural gas
  ]);

  res.status(200).json({ brent, wti, ng, updatedAt: new Date().toISOString() });
}
