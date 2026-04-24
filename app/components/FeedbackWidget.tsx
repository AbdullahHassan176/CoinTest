import { useState, useRef, useEffect } from "react";
import type { FeedbackPayload } from "../pages/api/feedback";

const CATEGORIES = [
  { id: "bug",     label: "Bug"     },
  { id: "feature", label: "Feature" },
  { id: "data",    label: "Data"    },
  { id: "general", label: "General" },
];

const RATING_LABELS = ["", "Poor", "Okay", "Good", "Great", "Excellent"];

type State = "closed" | "open" | "submitting" | "done";

export default function FeedbackWidget() {
  const [uiState, setUiState]   = useState<State>("closed");
  const [rating, setRating]     = useState(0);
  const [hoverRating, setHover] = useState(0);
  const [category, setCategory] = useState("general");
  const [message, setMessage]   = useState("");
  const [error, setError]       = useState("");
  const textareaRef             = useRef<HTMLTextAreaElement>(null);
  const panelRef                = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (uiState === "open") setTimeout(() => textareaRef.current?.focus(), 80);
  }, [uiState]);

  useEffect(() => {
    if (uiState !== "open") return;
    function onDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setUiState("closed");
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [uiState]);

  useEffect(() => {
    if (uiState !== "done") return;
    const t = setTimeout(() => { setUiState("closed"); reset(); }, 2800);
    return () => clearTimeout(t);
  }, [uiState]);

  function reset() {
    setRating(0); setHover(0); setCategory("general"); setMessage(""); setError("");
  }

  async function submit() {
    if (!message.trim()) { setError("Please add a message."); return; }
    if (!rating)          { setError("Please select a rating."); return; }
    setError("");
    setUiState("submitting");
    try {
      const body: FeedbackPayload = {
        rating, category,
        message: message.trim(),
        page: typeof window !== "undefined" ? window.location.pathname : "/",
      };
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Server error");
      setUiState("done");
    } catch {
      setUiState("open");
      setError("Submission failed — try again.");
    }
  }

  const displayRating = hoverRating || rating;

  return (
    <div className="fixed bottom-6 right-6 z-[4000] flex flex-col items-end gap-2 print:hidden select-none">

      {/* Panel */}
      {(uiState === "open" || uiState === "submitting") && (
        <div
          ref={panelRef}
          className="w-72 rounded-sm border border-white/[0.10] shadow-2xl overflow-hidden"
          style={{ background: "rgba(6,10,20,0.97)", backdropFilter: "blur(16px)" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.07]">
            <div>
              <div className="font-mono-data text-[8px] text-white/25 uppercase tracking-widest mb-0.5">Feedback</div>
              <div className="text-[13px] font-semibold text-white">How is the monitor?</div>
            </div>
            <button onClick={() => setUiState("closed")}
              className="text-white/22 hover:text-white/60 text-lg leading-none transition-colors font-light">
              ×
            </button>
          </div>

          <div className="px-4 py-3.5 space-y-4">
            {/* Numeric rating */}
            <div>
              <div className="font-mono-data text-[8px] text-white/25 uppercase tracking-widest mb-2">
                Rating{displayRating > 0 && <span className="ml-2 text-white/40 normal-case tracking-normal">{RATING_LABELS[displayRating]}</span>}
              </div>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => {
                  const filled = displayRating >= n;
                  return (
                    <button
                      key={n}
                      onClick={() => setRating(n)}
                      onMouseEnter={() => setHover(n)}
                      onMouseLeave={() => setHover(0)}
                      className="w-8 h-8 rounded-sm border font-mono-data text-[11px] font-medium transition-all"
                      style={{
                        background:   filled ? "#00B4CC22" : "rgba(255,255,255,0.03)",
                        borderColor:  filled ? "#00B4CC55" : "rgba(255,255,255,0.08)",
                        color:        filled ? "#00B4CC"   : "rgba(255,255,255,0.25)",
                        transform:    displayRating === n ? "scale(1.08)" : "none",
                      }}
                    >{n}</button>
                  );
                })}
              </div>
            </div>

            {/* Category chips */}
            <div>
              <div className="font-mono-data text-[8px] text-white/25 uppercase tracking-widest mb-2">Category</div>
              <div className="flex gap-1.5 flex-wrap">
                {CATEGORIES.map((c) => {
                  const active = category === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setCategory(c.id)}
                      className="font-mono-data text-[9px] px-2.5 py-1 rounded-sm border transition-colors"
                      style={{
                        borderColor: active ? "#00B4CC44" : "rgba(255,255,255,0.08)",
                        color:       active ? "#00B4CC"   : "rgba(255,255,255,0.35)",
                        background:  active ? "#00B4CC10" : "transparent",
                      }}
                    >{c.label}</button>
                  );
                })}
              </div>
            </div>

            {/* Message */}
            <div>
              <div className="font-mono-data text-[8px] text-white/25 uppercase tracking-widest mb-1.5">Message</div>
              <textarea
                ref={textareaRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="What is working, what is broken, what you would like to see..."
                rows={3}
                maxLength={500}
                className="w-full bg-black/30 border border-white/[0.07] rounded-sm font-mono-data text-[10px] text-white/65 placeholder-white/18 px-2.5 py-2 outline-none focus:border-hormuz-teal/35 resize-none transition-colors"
              />
              <div className="flex justify-between mt-0.5">
                {error
                  ? <span className="font-mono-data text-[8px] text-red-400">{error}</span>
                  : <span />}
                <span className="font-mono-data text-[8px] text-white/12">{message.length}/500</span>
              </div>
            </div>

            {/* Submit */}
            <button
              onClick={submit}
              disabled={uiState === "submitting"}
              className="w-full py-2 rounded-sm font-semibold text-xs transition-all"
              style={{
                background: uiState === "submitting" ? "rgba(0,180,204,0.20)" : "#00B4CC",
                color:      uiState === "submitting" ? "#00B4CC66"            : "#0A0E1A",
                cursor:     uiState === "submitting" ? "wait"                 : "pointer",
              }}
            >
              {uiState === "submitting" ? "Sending..." : "Send feedback"}
            </button>
          </div>
        </div>
      )}

      {/* Done state */}
      {uiState === "done" && (
        <div
          className="w-60 rounded-sm border border-white/[0.10] px-4 py-4 text-center shadow-2xl"
          style={{ background: "rgba(6,10,20,0.97)", backdropFilter: "blur(16px)" }}
        >
          <div className="font-semibold text-white text-sm mb-1.5">Feedback received</div>
          <div className="font-mono-data text-[9px] text-white/30">Thank you — it helps us improve the monitor.</div>
        </div>
      )}

      {/* Toggle button */}
      {uiState !== "done" && (
        <button
          onClick={() => setUiState(uiState === "open" ? "closed" : "open")}
          title="Send feedback about the monitor"
          className="font-mono-data text-[9px] uppercase tracking-widest px-3 py-2 rounded-sm border transition-all hover:scale-105 active:scale-95 shadow-lg"
          style={{
            background:  uiState !== "closed" ? "rgba(0,180,204,0.10)" : "rgba(6,10,20,0.90)",
            border:      `1px solid ${uiState !== "closed" ? "rgba(0,180,204,0.35)" : "rgba(255,255,255,0.10)"}`,
            color:       uiState !== "closed" ? "#00B4CC"               : "rgba(255,255,255,0.40)",
            backdropFilter: "blur(8px)",
          }}
        >
          Feedback
        </button>
      )}
    </div>
  );
}
