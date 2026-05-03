import type { NextApiRequest } from "next";

/**
 * Base URL for server-side `fetch()` to this app’s own `/api/*` routes.
 * `http://localhost:3000` fails on Vercel (no local server). Prefer env and
 * the incoming request’s Host / `x-forwarded-proto` when available.
 */
export function internalMonitorApiOrigin(req?: NextApiRequest): string {
  const envSite = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (envSite && /^https?:\/\//i.test(envSite)) {
    return envSite;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  if (req?.headers?.host) {
    const host = req.headers.host;
    const xf = req.headers["x-forwarded-proto"];
    const proto = (Array.isArray(xf) ? xf[0] : xf) || "http";
    return `${proto}://${host}`;
  }
  const port = process.env.PORT ?? "3000";
  return `http://127.0.0.1:${port}`;
}
