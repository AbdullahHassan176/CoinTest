import { useEffect, useState } from "react";
import type { OilData } from "../pages/api/monitor/oil";

type Quote = { price: number; change: number; changePct: number };

function QuoteCell({ label, q }: { label: string; q: Quote | null }) {
  if (!q) {
    return (
      <div className="flex flex-col gap-1">
        <span className="section-label">{label}</span>
        <span className="font-mono-data text-white/20 text-lg">—</span>
      </div>
    );
  }
  const up = q.change >= 0;
  return (
    <div className="flex flex-col gap-1">
      <span className="section-label">{label}</span>
      <span className="font-mono-data text-white text-lg font-medium">
        ${q.price.toFixed(2)}
      </span>
      <span
        className={`font-mono-data text-[11px] ${up ? "text-green-400" : "text-hormuz-red"}`}
      >
        {up ? "▲" : "▼"} {Math.abs(q.changePct).toFixed(2)}%
      </span>
    </div>
  );
}

export default function OilTicker() {
  const [data, setData] = useState<OilData | null>(null);

  useEffect(() => {
    const load = () =>
      fetch("/api/monitor/oil")
        .then((r) => r.json())
        .then(setData)
        .catch(() => {});
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <p className="section-label">Oil &amp; energy markets</p>
        {data?.updatedAt && (
          <span className="font-mono-data text-[9px] text-white/20">
            {new Date(data.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-4 divide-x divide-white/[0.06]">
        <QuoteCell label="Brent Crude" q={data?.brent ?? null} />
        <div className="pl-4">
          <QuoteCell label="WTI Crude"   q={data?.wti ?? null} />
        </div>
        <div className="pl-4">
          <QuoteCell label="Nat Gas"     q={data?.ng ?? null} />
        </div>
      </div>
      <p className="font-mono-data text-[9px] text-white/15 mt-3">
        Prices delayed 15 min · USD/bbl (crude) · USD/MMBtu (gas)
      </p>
    </div>
  );
}
