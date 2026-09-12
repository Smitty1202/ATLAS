import { useMemo } from "react";
import type { OwnedPal, PassiveEntry } from "../../lib/types";
import { genderView, ivBand, QUALITY_TEXT } from "../../lib/ui";
import { CondenseBadge } from "./instance-intel";
import {
  buildCondensationSummary,
  type CondensationMaterial,
  type CondensationTarget,
} from "./condensation";

function ivAverage(pal: OwnedPal): number {
  return Math.round((pal.ivs.hp + pal.ivs.attack + pal.ivs.defense) / 3);
}

function PalIdentity({ pal }: { pal: OwnedPal }) {
  const gender = genderView(pal.gender);
  const avg = ivAverage(pal);
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="truncate text-[12px] font-medium text-ink">
          {pal.nickname ? `“${pal.nickname}”` : `Level ${pal.level}`}
        </span>
        {pal.nickname && <span className="font-mono text-[9px] text-ink-faint">Lv {pal.level}</span>}
        <span className={gender.className} title={gender.label}>{gender.glyph}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[9px] text-ink-faint">
        <CondenseBadge rank={pal.rank} />
        <span>IV avg <span className={QUALITY_TEXT[ivBand(avg)]}>{avg}</span></span>
        <span>HP {pal.ivs.hp}</span>
        <span>ATK {pal.ivs.attack}</span>
        <span>DEF {pal.ivs.defense}</span>
      </div>
    </div>
  );
}

function ReasonList({ reasons }: { reasons: string[] }) {
  return (
    <div className="mt-1.5 space-y-1 text-[10px] leading-relaxed text-ink-faint">
      {reasons.map((reason, index) => (
        <div key={`${reason}-${index}`} className="flex gap-1.5">
          <span className="shrink-0 text-amber/70">•</span>
          <span>{reason}</span>
        </div>
      ))}
    </div>
  );
}

function TargetCard({ target, onOpen }: { target: CondensationTarget; onOpen: (pal: OwnedPal) => void }) {
  const role = target.roles.length === 2 ? "Combat + worker" : target.roles[0] === "combat" ? "Combat" : "Worker";
  return (
    <div className="rounded-md border border-amber/30 bg-amber/5 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-amber">{role} target</div>
          <div className="mt-1"><PalIdentity pal={target.pal} /></div>
        </div>
        <button type="button" onClick={() => onOpen(target.pal)} className="rounded border border-line bg-panel px-2 py-1 text-[10px] text-ink-dim transition-colors hover:border-amber/40 hover:text-ink">Open</button>
      </div>
      <ReasonList reasons={target.reasons} />
    </div>
  );
}

function MaterialRows({
  rows,
  empty,
  onOpen,
}: {
  rows: CondensationMaterial[];
  empty: string;
  onOpen: (pal: OwnedPal) => void;
}) {
  if (rows.length === 0) return <div className="px-3 py-3 text-[11px] text-ink-faint">{empty}</div>;
  return (
    <div className="divide-y divide-line-soft">
      {rows.map((entry) => (
        <div key={entry.pal.instance_id.join("-")} className="flex items-start gap-3 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <PalIdentity pal={entry.pal} />
            <ReasonList reasons={entry.reasons} />
          </div>
          <button type="button" onClick={() => onOpen(entry.pal)} className="shrink-0 rounded border border-line px-2 py-1 text-[9px] text-ink-faint transition-colors hover:border-amber/40 hover:text-ink">Open</button>
        </div>
      ))}
    </div>
  );
}

export function CondensationSummaryPanel({
  peers,
  passiveRows,
  onOpenPal,
}: {
  peers: OwnedPal[];
  passiveRows: ReadonlyMap<string, PassiveEntry>;
  onOpenPal: (pal: OwnedPal) => void;
}) {
  const summary = useMemo(() => buildCondensationSummary(peers, passiveRows), [peers, passiveRows]);
  if (peers.length === 0) return null;

  return (
    <section className="border-b border-line bg-abyss/25 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-amber">Condensation intelligence</div>
          <div className="mt-0.5 text-[11px] leading-relaxed text-ink-faint">
            Conservative same-species guidance. ATLAS never condenses anything and never treats Redundant as automatic fodder.
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 font-mono text-[9px] uppercase tracking-wider text-ink-faint">
          <div className="rounded border border-good/30 bg-good/5 px-2.5 py-1.5 text-center"><span className="block text-sm font-semibold text-good">{summary.safe.length}</span>safe</div>
          <div className="rounded border border-amber/30 bg-amber/5 px-2.5 py-1.5 text-center"><span className="block text-sm font-semibold text-amber">{summary.protected.length}</span>protected</div>
          <div className="rounded border border-line bg-raised/50 px-2.5 py-1.5 text-center"><span className="block text-sm font-semibold text-ink-dim">{summary.review.length}</span>review</div>
        </div>
      </div>

      <div className="mt-3 rounded-md border border-line bg-panel/50 px-3 py-2 text-[11px] text-ink-dim">
        <span className="font-semibold text-good">{summary.safeMaterialCount}</span> safe same-species {summary.safeMaterialCount === 1 ? "copy" : "copies"} currently available as condensation material. This count deliberately does not guess Palworld stage costs.
      </div>

      <div className="mt-3">
        <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-faint">Recommended target{summary.targets.length === 1 ? "" : "s"}</div>
        <div className="grid gap-2 xl:grid-cols-2">
          {summary.targets.map((target) => <TargetCard key={target.pal.instance_id.join("-")} target={target} onOpen={onOpenPal} />)}
        </div>
      </div>

      <div className="mt-3 grid gap-2 xl:grid-cols-3">
        <details open className="overflow-hidden rounded-md border border-good/25 bg-good/[0.03]">
          <summary className="cursor-pointer px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-good">Safe to Condense · {summary.safe.length}</summary>
          <MaterialRows rows={summary.safe} empty="No copies meet the strict safe-material rule." onOpen={onOpenPal} />
        </details>
        <details className="overflow-hidden rounded-md border border-amber/25 bg-amber/[0.03]">
          <summary className="cursor-pointer px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-amber">Protected · {summary.protected.length}</summary>
          <MaterialRows rows={summary.protected} empty="No protected copies." onOpen={onOpenPal} />
        </details>
        <details className="overflow-hidden rounded-md border border-line bg-panel/30">
          <summary className="cursor-pointer px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-ink-dim">Needs Review · {summary.review.length}</summary>
          <MaterialRows rows={summary.review} empty="No ambiguous copies need review." onOpen={onOpenPal} />
        </details>
      </div>
    </section>
  );
}
