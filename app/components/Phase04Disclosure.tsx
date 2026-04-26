import { PHASE_0_4, PHASE_0_4_BLOCKS } from "../content/phase04PermanentTexts";

type Props = {
  className?: string;
  /** Show the Phase 0.4 ribbon line above the blocks. */
  showPhaseLabel?: boolean;
};

export default function Phase04Disclosure({ className = "", showPhaseLabel = true }: Props) {
  return (
    <div className={className}>
      {showPhaseLabel && (
        <p className="font-mono-data text-[9px] uppercase tracking-widest text-yellow-500/55 mb-3">
          {PHASE_0_4.label}
        </p>
      )}
      <div className="space-y-4">
        {PHASE_0_4_BLOCKS.map((block) => (
          <section key={block.title} className="space-y-2">
            <h3 className="section-label">{block.title}</h3>
            {block.paragraphs.map((p, i) => (
              <p key={i} className="text-xs text-white/50 leading-relaxed">
                {p}
              </p>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
