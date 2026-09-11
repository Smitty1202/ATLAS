import type { OwnedPal, PassiveEntry } from "../../lib/types";
import { PassiveStrip } from "../../components/passive-strip";
import { recommendIntelPal } from "./recommendations";

function recommendationClasses(kind: "keep" | "breeding_candidate" | "redundant"): string {
  switch (kind) {
    case "keep":
      return "border-good/35 bg-good/10 text-good";
    case "redundant":
      return "border-bad/35 bg-bad/10 text-bad";
    default:
      return "border-amber/35 bg-amber/10 text-amber";
  }
}

export function CondenseBadge({ rank }: { rank: number }) {
  return (
    <span
      className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${
        rank > 0 ? "border-amber/30 bg-amber/5 text-amber" : "border-line bg-raised text-ink-faint"
      }`}
      title="Condensation level"
    >
      Condense {rank}/4
    </span>
  );
}

function passiveRankLabel(row: PassiveEntry | undefined): string {
  if (!row) return "Rank ?";
  if (row.tier === "worldtree") return `World Tree · R${row.rank}`;
  if (row.tier === "rainbow") return `Rainbow · R${row.rank}`;
  return `Rank ${row.rank}`;
}

export function IntelPassiveStrip({
  id,
  passiveRows,
}: {
  id: string;
  passiveRows: ReadonlyMap<string, PassiveEntry>;
}) {
  const row = passiveRows.get(id);
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <div className="min-w-0 flex-1">
        <PassiveStrip id={id} size="sm" />
      </div>
      <span
        className="shrink-0 rounded border border-line bg-raised px-1.5 py-1 font-mono text-[9px] text-ink-faint"
        title={row ? `${row.name} passive rank` : `${id} passive rank`}
      >
        {passiveRankLabel(row)}
      </span>
    </div>
  );
}

export function RecommendationSummary({
  pal,
  peers,
  passiveRows,
}: {
  pal: OwnedPal;
  peers: OwnedPal[];
  passiveRows: ReadonlyMap<string, PassiveEntry>;
}) {
  const recommendation = recommendIntelPal(pal, peers, passiveRows);
  return (
    <div className="mt-2 flex flex-wrap items-start gap-2">
      <span
        className={`shrink-0 rounded border px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide ${recommendationClasses(recommendation.kind)}`}
      >
        {recommendation.label}
      </span>
      <div className="min-w-[220px] flex-1 text-[10px] leading-relaxed text-ink-faint">
        {recommendation.reasons.map((reason, index) => (
          <span key={`${reason}-${index}`} className="mr-2 inline">
            {index > 0 && <span className="mr-2 text-ink-faint/50">•</span>}
            {reason}
          </span>
        ))}
      </div>
    </div>
  );
}
