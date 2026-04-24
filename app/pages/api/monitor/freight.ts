import type { NextApiRequest, NextApiResponse } from "next";
import YahooFinanceClass from "yahoo-finance2";
// yahoo-finance2 v3 exports a class — instantiate it
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yahooFinance = new (YahooFinanceClass as any)({ suppressNotices: ["yahooSurvey"] });

export type FreightQuote = {
  symbol: string;
  label: string;
  price: number;
  change: number;
  changePct: number;
} | null;

export type FreightData = {
  heatingOil: FreightQuote;
  gasoline:   FreightQuote;
  frontline:  FreightQuote; // FRO  — tanker company proxy for VLCC rates
  dht:        FreightQuote; // DHT  — DHT Holdings tanker stock
  hafnia:     FreightQuote; // HAFN — Hafnia tanker stock
  updatedAt:  string;
};

const SYMBOLS: Array<{ key: keyof Omit<FreightData, "updatedAt">; symbol: string; label: string }> = [
  { key: "heatingOil", symbol: "HO=F",  label: "Heating Oil (USD/gal)"     },
  { key: "gasoline",   symbol: "RB=F",  label: "RBOB Gasoline (USD/gal)"   },
  { key: "frontline",  symbol: "FRO",   label: "Frontline Ltd (USD/share)"  },
  { key: "dht",        symbol: "DHT",   label: "DHT Holdings (USD/share)"   },
  { key: "hafnia",     symbol: "HAFNIA.CO", label: "Hafnia (DKK/share)"     },
];

async function fetchOne(symbol: string, label: string): Promise<FreightQuote> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q: any = await yahooFinance.quote(symbol);
    return {
      symbol,
      label,
      price:     q.regularMarketPrice        ?? 0,
      change:    q.regularMarketChange       ?? 0,
      changePct: q.regularMarketChangePercent ?? 0,
    };
  } catch {
    return null;
  }
}

export default async function handler(
  _req: NextApiRequest,
  res: NextApiResponse<FreightData>
) {
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=60");

  const results = await Promise.all(SYMBOLS.map((s) => fetchOne(s.symbol, s.label)));

  const data: FreightData = {
    heatingOil: results[0],
    gasoline:   results[1],
    frontline:  results[2],
    dht:        results[3],
    hafnia:     results[4],
    updatedAt:  new Date().toISOString(),
  };

  res.status(200).json(data);
}
