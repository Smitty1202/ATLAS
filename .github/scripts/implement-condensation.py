from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(text, encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"anchor missing: {label}")
    return text.replace(old, new, 1)


write("app/src/views/pal-intelligence/condensation.ts", r'''import { isAlpha, type OwnedPal, type PassiveEntry } from "../../lib/types";
import { recommendIntelPal } from "./recommendations";
import { buildSpeciesRoleSummary } from "./species-roles";

export type CondensationMaterialKind = "safe" | "protected" | "review";

export interface CondensationMaterial {
  pal: OwnedPal;
  kind: CondensationMaterialKind;
  reasons: string[];
  dominant?: OwnedPal;
}

export interface CondensationTarget {
  pal: OwnedPal;
  roles: Array<"combat" | "worker">;
  reasons: string[];
}

export interface CondensationSummary {
  targets: CondensationTarget[];
  safe: CondensationMaterial[];
  protected: CondensationMaterial[];
  review: CondensationMaterial[];
  safeMaterialCount: number;
}

function stableId(pal: OwnedPal): string {
  return pal.instance_id.map((value) => value.toString(16).padStart(2, "0")).join("");
}

function samePal(a: OwnedPal | null | undefined, b: OwnedPal): boolean {
  return Boolean(a && stableId(a) === stableId(b));
}

function ivAverage(pal: OwnedPal): number {
  return Math.round((pal.ivs.hp + pal.ivs.attack + pal.ivs.defense) / 3);
}

function palLabel(pal: OwnedPal): string {
  return pal.nickname ? `“${pal.nickname}”` : `Lv ${pal.level}`;
}

function passiveRank(id: string, passiveRows: ReadonlyMap<string, PassiveEntry>): number | null {
  return passiveRows.get(id)?.rank ?? null;
}

function positiveOrUnknownPassiveIds(
  pal: OwnedPal,
  passiveRows: ReadonlyMap<string, PassiveEntry>,
): string[] {
  return pal.passives.filter((id) => {
    const rank = passiveRank(id, passiveRows);
    return rank === null || rank >= 0;
  });
}

function displayPassive(id: string, passiveRows: ReadonlyMap<string, PassiveEntry>): string {
  return passiveRows.get(id)?.name ?? id;
}

function rarePassiveNames(
  pal: OwnedPal,
  passiveRows: ReadonlyMap<string, PassiveEntry>,
): string[] {
  return pal.passives
    .map((id) => passiveRows.get(id))
    .filter((row): row is PassiveEntry => Boolean(row))
    .filter((row) => row.rank >= 4 || row.tier === "rainbow" || row.tier === "worldtree")
    .map((row) => row.name);
}

function uniquePositivePassives(
  pal: OwnedPal,
  peers: OwnedPal[],
  passiveRows: ReadonlyMap<string, PassiveEntry>,
): string[] {
  return positiveOrUnknownPassiveIds(pal, passiveRows).filter(
    (id) => !peers.some((peer) => peer !== pal && peer.passives.includes(id)),
  );
}

function uniqueMoves(pal: OwnedPal, peers: OwnedPal[]): string[] {
  return pal.active_skills.filter(
    (move) => !peers.some((peer) => peer !== pal && peer.active_skills.includes(move)),
  );
}

function soleBestStats(pal: OwnedPal, peers: OwnedPal[]): string[] {
  const stats: Array<["hp" | "attack" | "defense", string]> = [
    ["hp", "HP"],
    ["attack", "ATK"],
    ["defense", "DEF"],
  ];
  const out: string[] = [];
  for (const [key, label] of stats) {
    const max = Math.max(...peers.map((peer) => peer.ivs[key]));
    const carriers = peers.filter((peer) => peer.ivs[key] === max);
    if (pal.ivs[key] === max && carriers.length === 1) out.push(`${label} ${max}`);
  }
  return out;
}

function targetRows(
  peers: OwnedPal[],
  passiveRows: ReadonlyMap<string, PassiveEntry>,
): CondensationTarget[] {
  const roles = buildSpeciesRoleSummary(peers, passiveRows);
  const map = new Map<string, CondensationTarget>();
  const add = (role: "combat" | "worker", pal: OwnedPal | null | undefined) => {
    if (!pal) return;
    const key = stableId(pal);
    const current = map.get(key);
    if (current) {
      if (!current.roles.includes(role)) current.roles.push(role);
      current.reasons.push(role === "combat" ? "Best combat copy." : "Best worker copy.");
      return;
    }
    map.set(key, {
      pal,
      roles: [role],
      reasons: [role === "combat" ? "Best combat copy." : "Best worker copy."],
    });
  };
  add("combat", roles.combat?.pal);
  add("worker", roles.worker?.pal);
  for (const target of map.values()) {
    if (target.pal.rank > 0) {
      target.reasons.push(`Already Condense ${target.pal.rank}/4; preserves existing investment.`);
    }
  }
  return [...map.values()];
}

function protectionReasons(
  pal: OwnedPal,
  peers: OwnedPal[],
  passiveRows: ReadonlyMap<string, PassiveEntry>,
  targets: CondensationTarget[],
): string[] {
  const reasons: string[] = [];
  const roles = buildSpeciesRoleSummary(peers, passiveRows);
  const target = targets.find((entry) => samePal(entry.pal, pal));
  if (target) {
    const roleLabel = target.roles.length === 2 ? "combat + worker" : target.roles[0];
    reasons.push(`Recommended ${roleLabel} condensation target.`);
  }
  if (samePal(roles.breeding.male?.pal, pal)) reasons.push("Recommended male breeding-core copy.");
  if (samePal(roles.breeding.female?.pal, pal)) reasons.push("Recommended female breeding-core copy.");
  if (peers.length === 1) reasons.push("Only owned copy of this species.");
  if (pal.rank > 0) reasons.push(`Already Condense ${pal.rank}/4; do not recycle invested copies automatically.`);
  if (isAlpha(pal)) {
    const kind = pal.is_boss && pal.is_lucky ? "Field-boss + Lucky/rare" : pal.is_boss ? "Field-boss" : "Lucky/rare Alpha";
    reasons.push(`${kind} status is protected.`);
  }

  const rare = rarePassiveNames(pal, passiveRows);
  if (rare.length > 0) reasons.push(`High-tier passive carrier: ${rare.join(", ")}.`);

  const uniquePassives = uniquePositivePassives(pal, peers, passiveRows);
  if (uniquePassives.length > 0) {
    reasons.push(
      `Only owned carrier of positive/unknown passive${uniquePassives.length > 1 ? "s" : ""}: ${uniquePassives.map((id) => displayPassive(id, passiveRows)).join(", ")}.`,
    );
  }

  const moves = uniqueMoves(pal, peers);
  if (moves.length > 0) {
    reasons.push(`Only owned copy carrying equipped move${moves.length > 1 ? "s" : ""}: ${moves.join(", ")}.`);
  }

  const bestStats = soleBestStats(pal, peers);
  if (bestStats.length > 0) reasons.push(`Sole species-best IV coverage: ${bestStats.join(", ")}.`);

  if (pal.gender && peers.filter((peer) => peer.gender === pal.gender).length === 1) {
    reasons.push(`Only owned ${pal.gender.toLowerCase()} copy; preserves breeding-pair flexibility.`);
  }
  return reasons;
}

export function buildCondensationSummary(
  peers: OwnedPal[],
  passiveRows: ReadonlyMap<string, PassiveEntry>,
): CondensationSummary {
  if (peers.length === 0) {
    return { targets: [], safe: [], protected: [], review: [], safeMaterialCount: 0 };
  }

  const targets = targetRows(peers, passiveRows);
  const safe: CondensationMaterial[] = [];
  const protectedRows: CondensationMaterial[] = [];
  const review: CondensationMaterial[] = [];

  for (const pal of peers) {
    const protectedReasons = protectionReasons(pal, peers, passiveRows, targets);
    if (protectedReasons.length > 0) {
      protectedRows.push({ pal, kind: "protected", reasons: protectedReasons });
      continue;
    }

    const recommendation = recommendIntelPal(pal, peers, passiveRows);
    if (recommendation.kind === "redundant" && recommendation.dominant) {
      safe.push({
        pal,
        kind: "safe",
        dominant: recommendation.dominant,
        reasons: [
          `Safely dominated by ${palLabel(recommendation.dominant)} (Condense ${recommendation.dominant.rank}/4, IV avg ${ivAverage(recommendation.dominant)}).`,
          "Comparator preserves same-gender breeding value, positive/unknown passives, equipped moves, special status, condensation, level, and meets or beats every IV.",
        ],
      });
      continue;
    }

    review.push({
      pal,
      kind: "review",
      reasons: [
        "No fully preserving same-gender dominator proves this copy is safe material.",
        ...recommendation.reasons,
      ],
    });
  }

  return {
    targets,
    safe,
    protected: protectedRows,
    review,
    safeMaterialCount: safe.length,
  };
}
''')

write("app/src/views/pal-intelligence/condensation-summary.tsx", r'''import { useMemo } from "react";
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
''')

write("app/src/views/pal-intelligence/condensation.test.ts", r'''import { describe, expect, test } from "bun:test";
import type { OwnedPal, PassiveEntry } from "../../lib/types";
import { buildCondensationSummary } from "./condensation";

const A = Array.from({ length: 16 }, (_, i) => i + 1);
const B = Array.from({ length: 16 }, (_, i) => i + 21);
const C = Array.from({ length: 16 }, (_, i) => i + 41);
const D = Array.from({ length: 16 }, (_, i) => i + 61);
const E = Array.from({ length: 16 }, (_, i) => i + 81);

function pal(overrides: Partial<OwnedPal> = {}): OwnedPal {
  return {
    instance_id: A,
    character_id: "SheepBall",
    is_boss: false,
    is_lucky: false,
    is_human: false,
    gender: "Male",
    level: 20,
    rank: 0,
    passives: [],
    active_skills: [],
    ivs: { hp: 50, attack: 50, defense: 50 },
    nickname: null,
    owner_player_uid: A,
    container_id: null,
    slot_index: 0,
    container_kind: "Palbox",
    ...overrides,
  };
}

function passive(id: string, rank: number, name = id, effectType = "CraftSpeed"): PassiveEntry {
  return {
    id,
    name,
    rank,
    effects: [{ type: effectType, value: 20, target: "ToSelf" }],
    description: null,
    pal_facing: true,
    tier: null,
  };
}

const rows = new Map<string, PassiveEntry>([
  ["Artisan", passive("Artisan", 3, "Artisan")],
  ["Legend", passive("Legend", 4, "Legend", "MoveSpeed")],
  ["Musclehead", passive("Musclehead", 3, "Musclehead", "ShotAttack")],
  ["Clumsy", passive("Clumsy", -1, "Clumsy")],
]);

function materialFor(summary: ReturnType<typeof buildCondensationSummary>, id: number[]) {
  const key = id.join("-");
  return [...summary.safe, ...summary.protected, ...summary.review].find((entry) => entry.pal.instance_id.join("-") === key);
}

describe("Condensation Intelligence", () => {
  test("marks a truly dominated unprotected copy safe to condense", () => {
    const weak = pal({ instance_id: A, level: 10, passives: ["Clumsy"], ivs: { hp: 20, attack: 20, defense: 20 } });
    const strong = pal({ instance_id: B, level: 40, passives: [], ivs: { hp: 80, attack: 80, defense: 80 } });
    const summary = buildCondensationSummary([weak, strong], rows);
    const entry = materialFor(summary, A);
    expect(entry?.kind).toBe("safe");
    expect(entry?.dominant?.instance_id).toEqual(B);
    expect(summary.safeMaterialCount).toBe(1);
  });

  test("protects Alpha / special-status copies", () => {
    const alpha = pal({ instance_id: A, is_lucky: true, level: 10, ivs: { hp: 20, attack: 20, defense: 20 } });
    const strong = pal({ instance_id: B, level: 40, ivs: { hp: 80, attack: 80, defense: 80 } });
    const entry = materialFor(buildCondensationSummary([alpha, strong], rows), A);
    expect(entry?.kind).toBe("protected");
    expect(entry?.reasons.join(" ")).toContain("Lucky/rare Alpha");
  });

  test("protects existing condensation investment even when a stronger copy exists", () => {
    const invested = pal({ instance_id: A, rank: 1, level: 10, ivs: { hp: 20, attack: 20, defense: 20 } });
    const strong = pal({ instance_id: B, rank: 2, level: 40, ivs: { hp: 80, attack: 80, defense: 80 } });
    const entry = materialFor(buildCondensationSummary([invested, strong], rows), A);
    expect(entry?.kind).toBe("protected");
    expect(entry?.reasons.join(" ")).toContain("Condense 1/4");
  });

  test("protects the breeding core and the only owned gender", () => {
    const male = pal({ instance_id: A, gender: "Male", ivs: { hp: 20, attack: 20, defense: 20 } });
    const female1 = pal({ instance_id: B, gender: "Female", level: 30, ivs: { hp: 70, attack: 70, defense: 70 } });
    const female2 = pal({ instance_id: C, gender: "Female", level: 20, ivs: { hp: 60, attack: 60, defense: 60 } });
    const entry = materialFor(buildCondensationSummary([male, female1, female2], rows), A);
    expect(entry?.kind).toBe("protected");
    expect(entry?.reasons.join(" ")).toContain("male breeding-core");
    expect(entry?.reasons.join(" ")).toContain("Only owned male copy");
  });

  test("protects unique positive passive and equipped-move carriers", () => {
    const carrier = pal({ instance_id: A, passives: ["Artisan"], active_skills: ["Unique_SheepBall_Roll"], ivs: { hp: 20, attack: 20, defense: 20 } });
    const strong = pal({ instance_id: B, level: 40, ivs: { hp: 80, attack: 80, defense: 80 } });
    const entry = materialFor(buildCondensationSummary([carrier, strong], rows), A);
    expect(entry?.kind).toBe("protected");
    const text = entry?.reasons.join(" ") ?? "";
    expect(text).toContain("Artisan");
    expect(text).toContain("Unique_SheepBall_Roll");
  });

  test("protects sole species-best IV coverage", () => {
    const hpCarrier = pal({ instance_id: A, level: 10, ivs: { hp: 100, attack: 10, defense: 10 } });
    const balanced = pal({ instance_id: B, level: 50, ivs: { hp: 90, attack: 90, defense: 90 } });
    const entry = materialFor(buildCondensationSummary([hpCarrier, balanced], rows), A);
    expect(entry?.kind).toBe("protected");
    expect(entry?.reasons.join(" ")).toContain("HP 100");
  });

  test("sends ambiguous non-dominated copies to review instead of safe", () => {
    const baseline = pal({ instance_id: A, level: 40, ivs: { hp: 80, attack: 80, defense: 80 } });
    const atk = pal({ instance_id: B, level: 30, ivs: { hp: 70, attack: 95, defense: 70 } });
    const hp = pal({ instance_id: C, level: 30, ivs: { hp: 95, attack: 70, defense: 70 } });
    const ambiguous = pal({ instance_id: D, level: 20, ivs: { hp: 85, attack: 75, defense: 75 } });
    const spare = pal({ instance_id: E, level: 10, ivs: { hp: 10, attack: 10, defense: 10 } });
    const summary = buildCondensationSummary([baseline, atk, hp, ambiguous, spare], rows);
    const entry = materialFor(summary, D);
    expect(entry?.kind).toBe("review");
    expect(entry?.reasons.join(" ")).toContain("No fully preserving same-gender dominator");
    expect(materialFor(summary, E)?.kind).toBe("safe");
  });

  test("recommended combat and worker targets are always protected", () => {
    const fighter = pal({ instance_id: A, passives: ["Musclehead"], ivs: { hp: 70, attack: 95, defense: 70 } });
    const worker = pal({ instance_id: B, passives: ["Artisan"], gender: "Female", ivs: { hp: 70, attack: 70, defense: 70 } });
    const summary = buildCondensationSummary([fighter, worker], rows);
    for (const target of summary.targets) {
      expect(materialFor(summary, target.pal.instance_id)?.kind).toBe("protected");
    }
    expect(summary.targets.length).toBeGreaterThan(0);
  });
});
''')

p = Path("app/src/views/PalIntelligence.tsx")
s = read(str(p))
s = replace_once(
    s,
    'import { SpeciesRoleSummary } from "./pal-intelligence/species-role-summary";\n',
    'import { SpeciesRoleSummary } from "./pal-intelligence/species-role-summary";\nimport { CondensationSummaryPanel } from "./pal-intelligence/condensation-summary";\n',
    "condensation panel import",
)
anchor = '''              <SpeciesRoleSummary
                peers={selected.instances}
                passiveRows={passiveRows}
                onOpenPal={(pal) => requestDex(selected.species_id, hexGuid(pal.instance_id))}
                onImproveRole={(role, pick, targetPassives) =>
                  openSolver(
                    selected,
                    targetPassives,
                    targetPassives.length > 0
                      ? `Improve the visible best ${role} copy using only its role-relevant passives.`
                      : `Open Solver for the visible best ${role} copy; no role-specific passive target was inferred.`,
                    pick.pal,
                  )
                }
              />
'''
replacement = anchor + '''              <CondensationSummaryPanel
                peers={selected.instances}
                passiveRows={passiveRows}
                onOpenPal={(pal) => requestDex(selected.species_id, hexGuid(pal.instance_id))}
              />
'''
s = replace_once(s, anchor, replacement, "condensation panel render")
write(str(p), s)

p = Path("CHANGELOG.md")
s = read(str(p))
anchor = '''### Added
- Added typed Pal Intelligence handoffs into Solver and IV Lab so selected species and owned-instance context carry across tools without duplicating breeding or IV-planning logic.
'''
replacement = '''### Added
- Added conservative Condensation Intelligence with recommended combat/worker targets plus Safe to Condense, Protected, and Needs Review groups backed by visible same-species evidence.
- Condensation safety now protects role picks, breeding-core copies, unique positive passives and equipped moves, sole best-IV coverage, Alpha/Lucky/boss variants, gender diversity, and existing condensation investment.
- Added typed Pal Intelligence handoffs into Solver and IV Lab so selected species and owned-instance context carry across tools without duplicating breeding or IV-planning logic.
'''
s = replace_once(s, anchor, replacement, "v0.6 changelog")
write(str(p), s)
