import { useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { OwnedPal, PassiveEntry } from "../../lib/types";
import { PassiveCard } from "../../components/passive-card";
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

type PassiveTooltipPosition = {
  left: number;
  edge: "top" | "bottom";
  offset: number;
};

const TOOLTIP_WIDTH = 360;
const TOOLTIP_GAP = 8;
const TOOLTIP_MARGIN = 12;
const TOOLTIP_ESTIMATED_HEIGHT = 240;

function tooltipPosition(rect: DOMRect): PassiveTooltipPosition {
  const maxLeft = Math.max(TOOLTIP_MARGIN, window.innerWidth - TOOLTIP_WIDTH - TOOLTIP_MARGIN);
  const left = Math.min(Math.max(rect.left, TOOLTIP_MARGIN), maxLeft);
  const roomBelow = window.innerHeight - rect.bottom;
  const roomAbove = rect.top;
  const placeAbove = roomBelow < TOOLTIP_ESTIMATED_HEIGHT && roomAbove > roomBelow;

  return placeAbove
    ? { left, edge: "bottom", offset: window.innerHeight - rect.top + TOOLTIP_GAP }
    : { left, edge: "top", offset: rect.bottom + TOOLTIP_GAP };
}

function PassiveTooltip({
  id,
  row,
  position,
  tooltipId,
}: {
  id: string;
  row: PassiveEntry | undefined;
  position: PassiveTooltipPosition;
  tooltipId: string;
}) {
  const style =
    position.edge === "top"
      ? { left: position.left, top: position.offset }
      : { left: position.left, bottom: position.offset };

  return createPortal(
    <div
      id={tooltipId}
      role="tooltip"
      className="pointer-events-none fixed z-[100] w-[360px] max-w-[calc(100vw-24px)] overflow-hidden rounded-lg border border-line bg-abyss/98 shadow-2xl shadow-black/50"
      style={style}
    >
      {row ? (
        <>
          <PassiveCard passive={row} />
          <div className="flex items-center justify-between gap-3 border-t border-line-soft bg-panel/80 px-3 py-2 font-mono text-[9px] text-ink-faint">
            <span className="font-semibold text-ink-dim">{passiveRankLabel(row)}</span>
            <span className="truncate">{id}</span>
          </div>
        </>
      ) : (
        <div className="p-3">
          <div className="font-display text-[13px] font-semibold text-ink">{id}</div>
          <div className="mt-1 text-[11px] leading-relaxed text-ink-faint">
            ATLAS does not have descriptive data for this passive yet.
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

export function IntelPassiveStrip({
  id,
  passiveRows,
}: {
  id: string;
  passiveRows: ReadonlyMap<string, PassiveEntry>;
}) {
  const row = passiveRows.get(id);
  const anchorRef = useRef<HTMLDivElement>(null);
  const tooltipId = useId();
  const [position, setPosition] = useState<PassiveTooltipPosition | null>(null);

  const showTooltip = () => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (rect) setPosition(tooltipPosition(rect));
  };

  const hideTooltip = () => setPosition(null);

  return (
    <>
      <div
        ref={anchorRef}
        tabIndex={0}
        aria-describedby={position ? tooltipId : undefined}
        aria-label={row ? `${row.name}, ${passiveRankLabel(row)}` : id}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
        className="flex min-w-0 cursor-help items-center gap-1.5 rounded-sm outline-none focus-visible:ring-1 focus-visible:ring-amber/70"
      >
        <div className="pointer-events-none min-w-0 flex-1">
          <PassiveStrip id={id} size="sm" />
        </div>
        <span className="pointer-events-none shrink-0 rounded border border-line bg-raised px-1.5 py-1 font-mono text-[9px] text-ink-faint">
          {passiveRankLabel(row)}
        </span>
      </div>
      {position && (
        <PassiveTooltip id={id} row={row} position={position} tooltipId={tooltipId} />
      )}
    </>
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
