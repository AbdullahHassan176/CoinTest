/**
 * /embed — Embeddable HORMUZ status widget
 * Designed to be used in a 420×120px (or larger) iframe.
 * Shows: threat level, Brent price, chokepoint status, supply flow.
 */
import Head from "next/head";
import { useState, useEffect } from "react";
import type { ThreatData } from "./api/monitor/threat";
import type { OilData } from "./api/monitor/oil";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://hormuz.live";

const THREAT_COLOR: Record<string, string> = {
  LOW: "#22c55e", ELEVATED: "#C9A84C", HIGH: "#f97316", CRITICAL: "#CC2936",
};
const CHOKEPOINT_STATUS: Record<number, string> = {
  0: "OPEN", 1: "MONITORED", 2: "RESTRICTED", 3: "CRISIS",
};

export default function Embed() {
  const [threat, setThreat] = useState<ThreatData | null>(null);
  const [oil, setOil]       = useState<OilData | null>(null);
  const [ts, setTs]         = useState<string>("");

  useEffect(() => {
    const load = () => {
      fetch("/api/monitor/threat").then((r) => r.json()).then(setThreat).catch(() => {});
      fetch("/api/monitor/oil").then((r) => r.json()).then(setOil).catch(() => {});
      setTs(new Date().toUTCString().slice(17, 25) + " UTC");
    };
    load();
    const id = setInterval(load, 3 * 60_000);
    return () => clearInterval(id);
  }, []);

  const threatColor  = THREAT_COLOR[threat?.label ?? "LOW"] ?? "#22c55e";
  const chokeStatus  = CHOKEPOINT_STATUS[(threat?.level ?? 0) as 0|1|2|3];

  return (
    <>
      <Head>
        <title>HORMUZ Strait Status</title>
        <meta name="robots" content="noindex" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          background: "#0A0E1A",
          color: "white",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          padding: "12px 16px",
          boxSizing: "border-box",
        }}
      >
        <div style={{ width: "100%" }}>
          {/* Header row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <svg width="14" height="14" viewBox="0 0 22 22" fill="none" style={{ color: "#C9A84C", flexShrink: 0 }}>
                <circle cx="11" cy="11" r="4" stroke="currentColor" strokeWidth="1.5"/>
                <line x1="11" y1="0"  x2="11" y2="6"  stroke="currentColor" strokeWidth="1.5"/>
                <line x1="11" y1="16" x2="11" y2="22" stroke="currentColor" strokeWidth="1.5"/>
                <line x1="0"  y1="11" x2="6"  y2="11" stroke="currentColor" strokeWidth="1.5"/>
                <line x1="16" y1="11" x2="22" y2="11" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", color: "rgba(255,255,255,0.7)" }}>HORMUZ INTEL</span>
            </div>
            <span style={{ fontSize: 8, color: "rgba(255,255,255,0.25)", letterSpacing: "0.05em" }}>{ts || "loading…"}</span>
          </div>

          {/* Data row */}
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>

            {/* Threat */}
            <div>
              <div style={{ fontSize: 8, color: "rgba(255,255,255,0.35)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 3 }}>Threat</div>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: threatColor, display: "inline-block" }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: threatColor }}>{threat?.label ?? "—"}</span>
              </div>
              <div style={{ fontSize: 8, color: "rgba(255,255,255,0.30)", marginTop: 2 }}>{threat?.score ?? "—"}/100</div>
            </div>

            {/* Divider */}
            <div style={{ width: 1, background: "rgba(255,255,255,0.08)", alignSelf: "stretch" }} />

            {/* Chokepoint */}
            <div>
              <div style={{ fontSize: 8, color: "rgba(255,255,255,0.35)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 3 }}>Chokepoint</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: threatColor }}>{chokeStatus}</div>
              <div style={{ fontSize: 8, color: "rgba(255,255,255,0.30)", marginTop: 2 }}>Strait of Hormuz</div>
            </div>

            {/* Divider */}
            <div style={{ width: 1, background: "rgba(255,255,255,0.08)", alignSelf: "stretch" }} />

            {/* Brent */}
            <div>
              <div style={{ fontSize: 8, color: "rgba(255,255,255,0.35)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 3 }}>Brent Crude</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "white" }}>
                {oil?.brent?.price != null ? `$${oil.brent.price.toFixed(2)}` : "—"}
              </div>
              {oil?.brent?.changePct != null && (
                <div style={{ fontSize: 8, color: oil.brent.changePct >= 0 ? "#22c55e" : "#CC2936", marginTop: 2 }}>
                  {oil.brent.changePct >= 0 ? "▲" : "▼"}{Math.abs(oil.brent.changePct).toFixed(1)}%
                </div>
              )}
            </div>

            {/* Divider */}
            <div style={{ width: 1, background: "rgba(255,255,255,0.08)", alignSelf: "stretch" }} />

            {/* Link */}
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <a
                href="https://hormuz.live/monitor"
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 8, color: "#00B4CC", textDecoration: "none", letterSpacing: "0.08em" }}
              >
                Open Live Monitor →
              </a>
              <div style={{ fontSize: 7, color: "rgba(255,255,255,0.18)", marginTop: 3 }}>hormuz.live</div>
            </div>
          </div>

          <p style={{ fontSize: 7, color: "rgba(255,255,255,0.28)", lineHeight: 1.45, marginTop: 10, maxWidth: 400 }}>
            Official $STRAIT (Strait of Hormuz) — stateofhormuz.org only. Not the unaffiliated $HORMUZ on Birdeye — confirm the contract on our site.{" "}
            <a href={`${SITE}/#official-strait-pin`} target="_blank" rel="noreferrer" style={{ color: "#00B4CC" }}>
              Pin on home ↗
            </a>
            {" · "}
            <a href={`${SITE}/#phase-04-disclaimer`} target="_blank" rel="noreferrer" style={{ color: "#00B4CC" }}>
              Phase 0.4 ↗
            </a>
          </p>
        </div>
      </div>
    </>
  );
}
