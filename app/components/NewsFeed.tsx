import { useEffect, useState } from "react";
import type { NewsData, NewsItem } from "../pages/api/monitor/news";

function timeAgo(dateStr: string): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function NewsRow({ item }: { item: NewsItem }) {
  return (
    <a
      href={item.link}
      target="_blank"
      rel="noreferrer"
      className="group block py-3 border-b border-white/[0.05] last:border-0 hover:bg-white/[0.02] -mx-5 px-5 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-white/80 leading-snug group-hover:text-white transition-colors line-clamp-2 flex-1">
          {item.title}
        </p>
        <span className="font-mono-data text-[9px] text-white/25 shrink-0 mt-0.5">
          {timeAgo(item.pubDate)}
        </span>
      </div>
      <div className="flex items-center gap-2 mt-1.5">
        <span className="font-mono-data text-[9px] text-white/25 uppercase tracking-wider">
          {item.source}
        </span>
        <span className="font-mono-data text-[8px] text-white/15 group-hover:text-hormuz-teal/50 transition-colors">↗</span>
      </div>
    </a>
  );
}

export default function NewsFeed() {
  const [data, setData] = useState<NewsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () =>
      fetch("/api/monitor/news")
        .then((r) => r.json())
        .then(setData)
        .catch(() => {})
        .finally(() => setLoading(false));
    load();
    const id = setInterval(load, 3 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="card h-full flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <p className="section-label">Live intelligence feed</p>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-hormuz-teal animate-pulse" />
          <span className="font-mono-data text-[9px] text-white/25">
            {data ? `${data.items.length} items` : "—"}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto max-h-[460px] scrollbar-thin">
        {loading && (
          <div className="space-y-3 pt-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="py-3 border-b border-white/[0.05]">
                <div className="h-3 bg-white/5 rounded-sm mb-2 w-full animate-pulse" />
                <div className="h-3 bg-white/5 rounded-sm mb-2 w-3/4 animate-pulse" />
                <div className="h-2 bg-white/5 rounded-sm w-1/4 animate-pulse" />
              </div>
            ))}
          </div>
        )}
        {!loading && data?.items.length === 0 && (
          <p className="text-white/25 text-xs pt-4">No relevant news found. Check back shortly.</p>
        )}
        {!loading && data?.items.map((item, i) => (
          <NewsRow key={`${item.link}-${i}`} item={item} />
        ))}
      </div>
    </div>
  );
}
