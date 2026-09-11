import { useMemo } from "react";
import { isAlpha, type OwnedPal, type PassiveEntry } from "../../lib/types";
import { genderView, ivBand, QUALITY_TEXT } from "../../lib/ui";
import { Tag } from "../../components/primitives";
import { CondenseBadge } from "./instance-intel";
import {
  buildSpeciesRoleSummary,
  type SpeciesRolePick,
} from "./species-roles";

function ivAverage(pal: OwnedPal): number {
  return Math.round((pal.ivs.hp + pal.ivs.attack + pal.ivs.defense) / 3);
}

function PickIdentity({ pal }: { pal: OwnedPal }) {
  const gender = genderView(pal.gender);
  const avg = ivAverage(pal);
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="truncate font-display text-[13px] font-semibold text-ink">
          {pal.nickname ? `“${pal.nickname}”` : `Level ${pal.level}`}
        </span>
        {pal.nickname && <span className="font-mono text-[10px] text-ink-faint">Lv {pal.level}</span>}
        <span className={gender.className} title={gender.label}>{gender.glyph}</span>
        {isAlpha(pal) && <Tag tone="boss">Alpha</Tag>}
        {pal.is_boss && <Tag>Boss</Tag>}
        {pal.is_lucky && <Tag>Lucky</Tag>}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[10px] text-ink-faint">
        <CondenseBadge rank={pal.rank} />
        <span>IV avg <span className={QUALITY_TEXT[ivBand(avg)]}>{avg}</span></span>
        <span>ATK <span className={QUALITY_TEXT[ivBand(pal.ivs.attack)]}>{pal.ivs.attack}</span></span>
      </div>
    </div>
  );
}

function Reasons({ pick }: { pick: SpeciesRolePick }) {
  return (
    <div className="mt-2 space-y-1 text-[10px] leading-relaxed text-ink-faint">
      {pick.reasons.map((reason, index) => (
        <div key={`${reason}-${index}`} className="flex gap-1.5">
          <span className="shrink-0 text-amber/70">•</span>
          <span>{reason}</span>
        </div>
      ))}
    </div>
  );
}

function RoleCard({
  eyebrow,
  title,
  pick,
  onOpen,
}: {
  eyebrow: string;
  title: string;
  pick: SpeciesRolePick | null;
  onOpen: (pal: OwnedPal) => void;
}) {
  return (
    <div className="rounded-md border border-line bg-raised/45 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-amber">{eyebrow}</div>
          <div className="mt-0.5 font-display text-sm font-semibold text-ink">{title}</div>
        </div>
        {pick && (
          <button
            type="button"
            onClick={() => onOpen(pick.pal)}
            className="shrink-0 rounded border border-line bg-panel px-2 py-1 text-[10px] font-medium text-ink-dim transition-colors hover:border-amber/40 hover:text-ink"
          >
            Open
          </button>
        )}
      </div>
      {pick ? (
        <div className="mt-2">
          <PickIdentity pal={pick.pal} />
          <Reasons pick={pick} />
        </div>
      ) : (
        <div className="mt-2 text-[11px] text-ink-faint">No candidate available.</div>
      )}
    </div>
  );
}

function BreedingCandidate({
  label,
  pick,
  onOpen,
}: {
  label: "Male" | "Female";
  pick: SpeciesRolePick | null;
  onOpen: (pal: OwnedPal) => void;
}) {
  return (
    <div className="rounded border border-line-soft bg-abyss/35 p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="font-mono text-[9px] uppercase tracking-wider text-ink-faint">{label}</div>
        {pick && (
          <button
            type="button"
            onClick={() => onOpen(pick.pal)}
            className="rounded border border-line px-1.5 py-0.5 text-[9px] text-ink-faint transition-colors hover:border-amber/40 hover:text-ink"
          >
            Open
          </button>
        )}
      </div>
      {pick ? (
        <div className="mt-1.5">
          <PickIdentity pal={pick.pal} />
          <Reasons pick={pick} />
        </div>
      ) : (
        <div className="mt-1.5 text-[10px] leading-relaxed text-warn">
          No owned {label.toLowerCase()} copy — breeding pair is incomplete.
        </div>
      )}
    </div>
  );
}

export function SpeciesRoleSummary({
  peers,
  passiveRows,
  onOpenPal,
}: {
  peers: OwnedPal[];
  passiveRows: ReadonlyMap<string, PassiveEntry>;
  onOpenPal: (pal: OwnedPal) => void;
}) {
  const summary = useMemo(
    () => buildSpeciesRoleSummary(peers, passiveRows),
    [peers, passiveRows],
  );

  if (peers.length === 0) return null;

  return (
    <section className="border-b border-line bg-panel/25 px-5 py-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-amber">Species intelligence</div>
          <div className="mt-0.5 text-[11px] text-ink-faint">
            Explainable role picks from the owned copies shown for this species — no hidden weighted score.
          </div>
        </div>
      </div>
      <div className="grid gap-3 xl:grid-cols-3">
        <RoleCard eyebrow="Role pick" title="Best combat copy" pick={summary.combat} onOpen={onOpenPal} />
        <RoleCard eyebrow="Role pick" title="Best worker copy" pick={summary.worker} onOpen={onOpenPal} />
        <div className="rounded-md border border-line bg-raised/45 p-3">
          <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-amber">Breeding core</div>
          <div className="mt-0.5 font-display text-sm font-semibold text-ink">Best male + female candidates</div>
          <div className="mt-2 grid gap-2">
            <BreedingCandidate label="Male" pick={summary.breeding.male} onOpen={onOpenPal} />
            <BreedingCandidate label="Female" pick={summary.breeding.female} onOpen={onOpenPal} />
          </div>
        </div>
      </div>
    </section>
  );
}
