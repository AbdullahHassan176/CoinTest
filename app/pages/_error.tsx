import type { NextPageContext } from "next";
import Head from "next/head";
import Link from "next/link";

type Props = { statusCode?: number };

/**
 * Custom error page — avoids opaque dev overlay loops when `.next` is stale or locked (Windows EPERM on `trace`).
 */
export default function CustomError({ statusCode }: Props) {
  return (
    <>
      <Head>
        <title>{statusCode ? `Error ${statusCode}` : "Error"} — HORMUZ</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div
        className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
        style={{ background: "#0A0E1A", color: "rgba(255,255,255,0.92)", fontFamily: "IBM Plex Mono, monospace" }}
      >
        <h1 className="text-base mb-2" style={{ color: "#C9A84C" }}>
          {statusCode ? `HTTP ${statusCode}` : "Something went wrong"}
        </h1>
        <p className="text-xs max-w-md leading-relaxed mb-6" style={{ color: "rgba(255,255,255,0.55)" }}>
          If you see &quot;missing required error components, refreshing…&quot; in dev: stop all{" "}
          <code className="text-[#00B4CC]">next dev</code> processes (only one on port 3000), delete the{" "}
          <code className="text-[#00B4CC]">app/.next</code> folder, then run{" "}
          <code className="text-[#00B4CC]">npm run dev</code> again. Do not delete <code className="text-[#00B4CC]">.next</code> while the server is running.
        </p>
        <div className="flex flex-wrap gap-3 text-xs justify-center">
          <Link href="/" style={{ color: "#00B4CC" }}>Home</Link>
          <Link href="/monitor" style={{ color: "#00B4CC" }}>Monitor</Link>
        </div>
      </div>
    </>
  );
}

CustomError.getInitialProps = ({ res, err }: NextPageContext) => {
  const fromRes = res?.statusCode;
  const fromErr = err && typeof (err as { statusCode?: unknown }).statusCode === "number"
    ? (err as { statusCode: number }).statusCode
    : undefined;
  const statusCode = fromRes ?? fromErr ?? (err ? 500 : 404);
  return { statusCode };
};
