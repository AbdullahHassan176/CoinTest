import type { NextApiRequest, NextApiResponse } from "next";

export type FeedbackPayload = {
  rating:   number;       // 1-5
  category: string;       // "bug" | "feature" | "data" | "general"
  message:  string;
  page:     string;       // window.location.pathname
};

const CATEGORY_LABELS: Record<string, string> = {
  bug:     "🐛 Bug Report",
  feature: "💡 Feature Request",
  data:    "📊 Data Issue",
  general: "💬 General",
};

const RATING_EMOJI = ["", "😤", "😐", "🙂", "😊", "🤩"];

const COLORS: Record<string, number> = {
  bug:     0xCC2936,
  feature: 0x00B4CC,
  data:    0xC9A84C,
  general: 0x22c55e,
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { rating, category, message, page } = req.body as FeedbackPayload;

  if (!message?.trim()) return res.status(400).json({ error: "Message required" });
  if (rating < 1 || rating > 5) return res.status(400).json({ error: "Rating must be 1-5" });

  const webhookUrl = process.env.DISCORD_FEEDBACK_WEBHOOK;

  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embeds: [{
            title: `${RATING_EMOJI[rating]} ${CATEGORY_LABELS[category] ?? "Feedback"} — ${rating}/5`,
            description: message.slice(0, 1900),
            color: COLORS[category] ?? 0x8888aa,
            fields: [
              { name: "Page", value: page || "/", inline: true },
              { name: "Rating", value: `${RATING_EMOJI[rating]} ${rating}/5`, inline: true },
            ],
            footer: { text: `HORMUZ feedback · ${new Date().toUTCString()}` },
          }],
        }),
      });
    } catch (err) {
      console.error("[feedback] Discord webhook error:", err);
      // Don't fail the request — user gets success regardless
    }
  } else {
    // Dev fallback — log to console
    console.log("[feedback]", { rating, category, message: message.slice(0, 200), page });
  }

  return res.status(200).json({ ok: true });
}
