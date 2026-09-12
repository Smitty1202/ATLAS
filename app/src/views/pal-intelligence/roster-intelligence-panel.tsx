import { useEffect, useMemo, useState } from "react";
import { PalIcon, Tag } from "../../components/primitives";
import { invoke } from "../../lib/tauri";
import { containerLabel } from "../../lib/ui";
import {
  type OwnedPal,
  type PassiveEntry,
  type SpeciesEntry,
} from "../../lib/types";
import { CondenseBadge } from "./instance-intel";
import {
  buildRosterIntelligence,
  type CoverageKind,
  type RosterRoleCandidate,
  type RosterRoleSummary,
} from "./roster-intelligence";

const COVERAGE_STYLE: Record<CoverageKind, string> = {
  healthy: "border-good/35 bg-good/5 text-good",
  thin: "border-amber/35 bg-amber/5 text-amber",
  weak: "border-bad/35 bg-bad/5 text-bad",
  missing: "border-bad/35 bg-bad/5 text-bad",
};

function CandidateRow({
  candidate,
  index,
  onInspect,
}: {
  candidate: RosterRoleCandidate;
  index: number;
  onInspect: () => void;
}) {
  const { pal, species } = candidate;
  return (
    <div className="border-t border-line-soft px-3 py-3 first:border-t-0">
      <div className="flex items-start gap-3">
        <div className="w-5 shrink-0 pt-2 text-center font-display text-lg font-bold text-amber">{index + 1}</div>
        <PalIcon id={species.id} name={species.name} size={42} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium text-ink">{species.name}</span>
            {pal.nickname && <span className="text-[11px] text-ink-faint">“{pal.nickname}”</span>}
            {candidate.suitability !== null && <Tag>{candidate.suitability} work</Tag>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[9px] uppercase tracking-wider text-ink-faint">
            <span>Lv {pal.level}</span>
            <CondenseBadge rank={pal.rank} />
            <span>{containerLabel(pal.container_kind)}</span>
            <span>IV {pal.ivs.hp}/{pal.ivs.attack}/{pal.ivs.defense}</span>
          </div>
          <div className="mt-2 space-y-1 text-[10px] leading-relaxed text-ink-faint">
            {candidate.reasons.slice(0, 3).map((reason) => (
              <div key={reason} className="flex gap-1.5">
                <span className="shrink-0 text-amber/70">•</span>
                <span>{reason}</span>
              </div>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={onInspect}
          className="shrink-0 rounded-md border border-line bg-raised px-2.5 py-1.5 text-[10px] font-medium text-ink-dim transition-colors hover:border-amber/40 hover:text-ink"
        >
          Inspect
        </button>
      </div>
    </div>
  );
}

function RoleCard({
  summary,
  onInspectSpecies,
}: {
  summary: RosterRoleSummary;
  onInspectSpecies: (speciesId: string) => void;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-line bg-panel/60">
      <div className="border-b border-line px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-amber">Roster role</div>
            <h2 className="mt-0.5 font-display text-lg font-bold text-ink">{summary.label}</h2>
          </div>
          <span className={`rounded border px-2 py-1 font-mono text-[9px] uppercase tracking-wider ${COVERAGE_STYLE[summary.coverage]}`}>
            {summary.coverage}
          </span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">{summary.coverageReason}</p>
      </div>

      {summary.candidates.length > 0 ? (
        summary.candidates.map((candidate, index) => (
          <CandidateRow
            key={candidate.pal.instance_id.join("-")}
            candidate={candidate}
            index={index}
            onInspect={() => onInspectSpecies(candidate.species.id)}
          />
        ))
      ) : (
        <div className="px-4 py-6 text-center text-[12px] text-ink-faint">No owned candidate for this role.</div>
      )}
    </section>
  );
}

export function RosterIntelligencePanel({
  pals,
  passiveRows,
  onInspectSpecies,
}: {
  pals: OwnedPal[];
  passiveRows: ReadonlyMap<string, PassiveEntry>;
  onInspectSpecies: (speciesId: string) => void;
}) {
  const [species, setSpecies] = useState<SpeciesEntry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    invoke<SpeciesEntry[]>("paldex_species")
      .then((rows) => {
        if (!live) return;
        setSpecies(rows);
        setLoadError(null);
      })
      .catch((error) => {
        if (live) setLoadError(String(error));
      });
    return () => {
      live = false;
    };
  }, []);

  const speciesRows = useMemo(
    () => new Map(species.map((entry) => [entry.id, entry])),
    [species],
  );
  const summary = useMemo(
    () => buildRosterIntelligence(pals, speciesRows, passiveRows),
    [pals, speciesRows, passiveRows],
  );

  if (loadError) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="rounded-lg border border-bad/30 bg-bad/10 p-4 text-sm text-bad">
          Couldn’t load species role data: {loadError}
        </div>
      </div>
    );
  }

  if (species.length === 0) {
    return <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-ink-faint">Loading roster role data…</div>;
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-5">
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 rounded-lg border border-line bg-raised/30 px-4 py-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-amber">Cross-species Roster Intelligence</div>
          <p className="mt-1 max-w-4xl text-[12px] leading-relaxed text-ink-faint">
            Best owned options across the active roster. Work suitability and role-specific passive evidence come first; investment, stats, and support traits only break ties. Each role keeps one best instance per species so duplicate copies cannot crowd out roster depth.
          </p>
          <div className="mt-2 font-mono text-[9px] uppercase tracking-wider text-ink-faint">
            <span className="text-ink-dim">{pals.length}</span> scoped owned Pals · specialist work coverage = suitability Lv3+
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          {summary.roles.map((entry) => (
            <RoleCard key={entry.role} summary={entry} onInspectSpecies={onInspectSpecies} />
          ))}
        </div>
      </div>
    </div>
  );
}
