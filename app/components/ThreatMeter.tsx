import { useEffect, useState } from "react";
import type { ThreatData } from "../pages/api/monitor/threat";

const LEVEL_CONFIG = {
  LOW:      { color: "#00B4CC", bg: "bg-hormuz-teal/10",  border: "border-hormuz-teal/30",  dot: "bg-hormuz-teal",  barW: "w-1/4"  },
  ELEVATED: { color: "#C9A84C", bg: "bg-hormuz-gold/10",  border: "border-hormuz-gold/30",  dot: "bg-hormuz-gold",  barW: "w-2/4"  },
  HIGH:     { color: "#f97316", bg: "bg-orange-500/10",   border: "border-orange-500/30",   dot: "bg-orange-500",   barW: "w-3/4"  },
  CRITICAL: { color: "#CC2936", bg: "bg-hormuz-red/10",   border: "border-hormuz-red/30",   dot: "bg-hormuz-red",   barW: "w-full" },
};

export default function ThreatMeter() {
  const [data, setData] = useState<ThreatData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () =>
      fetch("/api/monitor/threat")
        .then((r) => r.json())
        .then(setData)
        .catch(() => {})
        .finally(() => setLoading(false));
    load();
    const id = setInterval(load, 3 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const cfg = data ? LEVEL_CONFIG[data.label] : LEVEL_CONFIG.LOW;

  return (
    <div className={`rounded-lg border ${cfg.border} ${cfg.bg} p-4 backdrop-blur-sm`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${loading ? "bg-white/20" : cfg.dot} ${!loading && data ? "animate-pulse" : ""}`} />
          <span className="section-label">Strait threat level</span>
        </div>
        {data && (
          <span className="font-mono-data text-[10px] text-white/25">
            score {data.score}
          </span>
        )}
      </div>

      {/* Level label */}
      <div
        className="font-display-condensed text-4xl leading-none mb-3"
        style={{ color: loading ? "rgba(255,255,255,0.15)" : cfg.color }}
      >
        {loading ? "—" : data?.label ?? "—"}
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden mb-3">
        <div
          className={`h-full rounded-full transition-all duration-700 ${loading ? "w-0" : cfg.barW}`}
          style={{ backgroundColor: cfg.color }}
        />
      </div>

      {/* Segments */}
      <div className="flex gap-1">
        {(["LOW", "ELEVATED", "HIGH", "CRITICAL"] as const).map((l) => {
          const active = data && (
            l === "LOW" ? data.level >= 0 :
            l === "ELEVATED" ? data.level >= 1 :
            l === "HIGH" ? data.level >= 2 : data.level >= 3
          );
          return (
            <div
              key={l}
              className="flex-1 h-1 rounded-sm transition-all duration-500"
              style={{
                backgroundColor: active
                  ? LEVEL_CONFIG[l].color
                  : "rgba(255,255,255,0.06)",
              }}
            />
          );
        })}
      </div>

      {data?.factors && data.factors.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {data.factors.slice(0, 6).map((f) => (
            <span
              key={f}
              className="font-mono-data text-[9px] px-1.5 py-0.5 rounded-sm bg-white/5 text-white/30 uppercase tracking-wider"
            >
              {f}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
