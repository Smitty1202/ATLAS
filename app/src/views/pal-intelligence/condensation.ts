import { isAlpha, type OwnedPal, type PassiveEntry } from "../../lib/types";
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
