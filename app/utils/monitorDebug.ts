/**
 * Strait Monitor diagnostics. Opt-in verbose logging to validate data-path issues
 * before changing behavior.
 *
 * Client: set NEXT_PUBLIC_MONITOR_DEBUG=1 or run `next dev` (development logs fetch outcomes).
 * API: set MONITOR_API_DEBUG=1 or run `next dev` (server logs for instrumented routes).
 */

function clientLoggingEnabled(): boolean {
  return (
    typeof window !== "undefined" &&
    (process.env.NEXT_PUBLIC_MONITOR_DEBUG === "1" ||
      process.env.NODE_ENV === "development")
  );
}

function apiLoggingEnabled(): boolean {
  return (
    process.env.MONITOR_API_DEBUG === "1" ||
    process.env.NODE_ENV === "development"
  );
}

/** Browser-only: `/monitor` useFetch and related client-side checks. */
export function monitorClientDebug(message: string, ...rest: unknown[]): void {
  if (!clientLoggingEnabled()) return;
  console.log(`[monitor] ${message}`, ...rest);
}

/** Next.js API routes: timing, branches, upstream failures (no secrets). */
export function monitorApiDebug(message: string, ...rest: unknown[]): void {
  if (!apiLoggingEnabled()) return;
  console.log(`[monitor-api] ${message}`, ...rest);
}
