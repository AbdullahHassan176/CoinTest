import Link from "next/link";
import { OFFICIAL_STRAIT_PIN } from "../content/officialStraitMessaging";

/** Ultra-compact strip for monitor status area (same copy as pin). */
export function OfficialStraitPinStrip() {
  return (
    <div className="shrink-0 border-b border-hormuz-gold/25 bg-hormuz-gold/[0.05] px-2 sm:px-3 py-1.5">
      <p className="font-mono-data text-[8px] sm:text-[9px] text-white/75 leading-snug text-center lg:text-left max-w-6xl lg:mx-auto">
        <span className="text-hormuz-gold/95 font-semibold">{OFFICIAL_STRAIT_PIN.line1}</span>
        <span className="text-white/35 mx-1 hidden lg:inline">·</span>
        <span className="block lg:inline mt-0.5 lg:mt-0 font-normal text-white/60">{OFFICIAL_STRAIT_PIN.line2}</span>
        {" "}
        <Link href="/#official-strait-pin" className="text-hormuz-teal/90 hover:text-hormuz-teal underline underline-offset-2 whitespace-nowrap">
          Pin on home
        </Link>
      </p>
    </div>
  );
}

type Props = {
  id?: string;
  className?: string;
  /** Tighter padding for sidebars / modals */
  dense?: boolean;
};

export default function OfficialStraitPinCallout({ id, className = "", dense }: Props) {
  return (
    <div
      id={id}
      className={`rounded-md border border-hormuz-gold/30 bg-hormuz-gold/[0.07] ${dense ? "px-3 py-2.5" : "px-4 py-3"} ${className}`}
    >
      <p className="font-mono-data text-[11px] sm:text-xs text-white/90 leading-snug font-semibold tracking-tight">
        {OFFICIAL_STRAIT_PIN.line1}
      </p>
      <p className="font-mono-data text-[10px] sm:text-[11px] text-white/70 leading-relaxed mt-2">
        {OFFICIAL_STRAIT_PIN.line2}
      </p>
      <Link
        href="/#phase-04-disclaimer"
        className="inline-block mt-2 font-mono-data text-[9px] text-hormuz-teal/85 hover:text-hormuz-teal underline underline-offset-2"
      >
        Phase 0.4 disclaimer (full legal text)
      </Link>
    </div>
  );
}
