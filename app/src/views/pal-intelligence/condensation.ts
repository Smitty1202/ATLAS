import { isAlpha, type OwnedPal, type PassiveEntry } from "../../lib/types";
import {
  buildSpeciesRoleSummary,
  type SpeciesRoleSummary,
} from "./species-roles";

export type CondensationMaterialKind = "safe" | "likely" | "protected" | "review";

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
  likely: CondensationMaterial[];
  protected: CondensationMaterial[];
  review: CondensationMaterial[];
  safeMaterialCount: number;
  likelyMaterialCount: number;
}

type StatKey = "hp" | "attack" | "defense";

type KeeperRequirement = {
  key: string;
  reason: string;
  covers: (pal: OwnedPal) => boolean;
};

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
  const row = passiveRows.get(id);
  if (!row) return id;
  return `${row.name} (Rank ${row.rank})`;
}

function isMeaningfulPassive(row: PassiveEntry): boolean {
  return row.rank >= 3 || row.tier === "rainbow" || row.tier === "worldtree";
}

function meaningfulPassiveCount(
  pal: OwnedPal,
  passiveRows: ReadonlyMap<string, PassiveEntry>,
): number {
  return pal.passives.filter((id) => {
    const row = passiveRows.get(id);
    return Boolean(row && row.rank >= 0 && isMeaningfulPassive(row));
  }).length;
}

function negativePassiveCount(
  pal: OwnedPal,
  passiveRows: ReadonlyMap<string, PassiveEntry>,
): number {
  return pal.passives.filter((id) => (passiveRows.get(id)?.rank ?? 0) < 0).length;
}

function targetRows(roles: SpeciesRoleSummary): CondensationTarget[] {
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

function addKeeperReason(
  reasons: Map<string, string[]>,
  pal: OwnedPal | null | undefined,
  reason: string,
): void {
  if (!pal) return;
  const key = stableId(pal);
  const current = reasons.get(key) ?? [];
  if (!current.includes(reason)) current.push(reason);
  reasons.set(key, current);
}

function requirementCarrierOrder(
  a: OwnedPal,
  b: OwnedPal,
  passiveRows: ReadonlyMap<string, PassiveEntry>,
): number {
  return (
    meaningfulPassiveCount(b, passiveRows) - meaningfulPassiveCount(a, passiveRows) ||
    b.rank - a.rank ||
    negativePassiveCount(a, passiveRows) - negativePassiveCount(b, passiveRows) ||
    ivAverage(b) - ivAverage(a) ||
    b.level - a.level ||
    stableId(a).localeCompare(stableId(b))
  );
}

/**
 * Builds a small, deterministic keeper core for the species. Hard protections
 * are seeded first, then uncovered high-value passives and species-best IVs are
 * covered greedily, preferring one Pal that satisfies multiple requirements.
 * This deliberately preserves capabilities across the roster rather than
 * protecting every copy that happens to carry one useful trait.
 */
function buildKeeperCore(
  peers: OwnedPal[],
  passiveRows: ReadonlyMap<string, PassiveEntry>,
  roles: SpeciesRoleSummary,
  targets: CondensationTarget[],
): Map<string, string[]> {
  const reasons = new Map<string, string[]>();

  for (const target of targets) {
    const roleLabel = target.roles.length === 2 ? "combat + worker" : target.roles[0];
    addKeeperReason(reasons, target.pal, `Recommended ${roleLabel} condensation target.`);
  }
  addKeeperReason(reasons, roles.breeding.male?.pal, "Recommended male breeding-core copy.");
  addKeeperReason(reasons, roles.breeding.female?.pal, "Recommended female breeding-core copy.");

  if (peers.length === 1) addKeeperReason(reasons, peers[0], "Only owned copy of this species.");

  for (const pal of peers) {
    if (pal.rank > 0) {
      addKeeperReason(reasons, pal, `Already Condense ${pal.rank}/4; preserves existing investment.`);
    }
    if (isAlpha(pal)) {
      const kind = pal.is_boss && pal.is_lucky
        ? "Field-boss + Lucky/rare"
        : pal.is_boss
          ? "Field-boss"
          : "Lucky/rare Alpha";
      addKeeperReason(reasons, pal, `${kind} status is protected.`);
    }
    if (pal.gender && peers.filter((peer) => peer.gender === pal.gender).length === 1) {
      addKeeperReason(
        reasons,
        pal,
        `Only owned ${pal.gender.toLowerCase()} copy; preserves breeding-pair flexibility.`,
      );
    }
  }

  const requirements: KeeperRequirement[] = [];
  const meaningfulIds = [...new Set(peers.flatMap((pal) => pal.passives))]
    .filter((id) => {
      const row = passiveRows.get(id);
      return Boolean(row && row.rank >= 0 && isMeaningfulPassive(row));
    })
    .sort((a, b) => displayPassive(a, passiveRows).localeCompare(displayPassive(b, passiveRows)));

  for (const id of meaningfulIds) {
    requirements.push({
      key: `passive:${id}`,
      reason: `Selected keeper for high-value passive: ${displayPassive(id, passiveRows)}.`,
      covers: (pal) => pal.passives.includes(id),
    });
  }

  const stats: Array<[StatKey, string]> = [
    ["hp", "HP"],
    ["attack", "ATK"],
    ["defense", "DEF"],
  ];
  for (const [key, label] of stats) {
    const max = Math.max(...peers.map((pal) => pal.ivs[key]));
    requirements.push({
      key: `iv:${key}`,
      reason: `Selected keeper for species-best ${label} IV (${max}).`,
      covers: (pal) => pal.ivs[key] === max,
    });
  }

  const isCovered = (requirement: KeeperRequirement) =>
    peers.some((pal) => reasons.has(stableId(pal)) && requirement.covers(pal));

  let uncovered = requirements.filter((requirement) => !isCovered(requirement));
  while (uncovered.length > 0) {
    const candidates = peers
      .filter((pal) => !reasons.has(stableId(pal)))
      .map((pal) => ({
        pal,
        covered: uncovered.filter((requirement) => requirement.covers(pal)),
      }))
      .filter((entry) => entry.covered.length > 0)
      .sort(
        (a, b) =>
          b.covered.length - a.covered.length ||
          requirementCarrierOrder(a.pal, b.pal, passiveRows),
      );

    const winner = candidates[0];
    if (!winner) break;
    for (const requirement of winner.covered) {
      addKeeperReason(reasons, winner.pal, requirement.reason);
    }
    uncovered = requirements.filter((requirement) => !isCovered(requirement));
  }

  return reasons;
}

function allKeepers(
  peers: OwnedPal[],
  keeperReasons: ReadonlyMap<string, string[]>,
): OwnedPal[] {
  return peers.filter((pal) => keeperReasons.has(stableId(pal)));
}

function bestSameGenderKeeper(
  pal: OwnedPal,
  keepers: OwnedPal[],
  passiveRows: ReadonlyMap<string, PassiveEntry>,
): OwnedPal | undefined {
  if (!pal.gender) return undefined;
  return keepers
    .filter((keeper) => keeper.gender === pal.gender)
    .sort((a, b) => requirementCarrierOrder(a, b, passiveRows))[0];
}

function coveredByKeeperCore(
  pal: OwnedPal,
  keepers: OwnedPal[],
  passiveRows: ReadonlyMap<string, PassiveEntry>,
): boolean {
  if (!pal.gender || !keepers.some((keeper) => keeper.gender === pal.gender)) return false;

  const positiveOrUnknown = positiveOrUnknownPassiveIds(pal, passiveRows);
  if (!positiveOrUnknown.every((id) => keepers.some((keeper) => keeper.passives.includes(id)))) {
    return false;
  }

  if (!pal.active_skills.every((move) => keepers.some((keeper) => keeper.active_skills.includes(move)))) {
    return false;
  }

  return (
    keepers.some((keeper) => keeper.ivs.hp >= pal.ivs.hp) &&
    keepers.some((keeper) => keeper.ivs.attack >= pal.ivs.attack) &&
    keepers.some((keeper) => keeper.ivs.defense >= pal.ivs.defense)
  );
}

function reviewReasons(
  pal: OwnedPal,
  keepers: OwnedPal[],
  passiveRows: ReadonlyMap<string, PassiveEntry>,
): string[] {
  const reasons: string[] = [];
  if (!pal.gender) reasons.push("Gender is unknown; ATLAS cannot prove breeding-pair coverage.");
  else if (!keepers.some((keeper) => keeper.gender === pal.gender)) {
    reasons.push(`No protected ${pal.gender.toLowerCase()} keeper remains to preserve breeding-pair flexibility.`);
  }

  const uncoveredUnknown = pal.passives.filter(
    (id) =>
      !passiveRows.has(id) &&
      !keepers.some((keeper) => keeper.passives.includes(id)),
  );
  if (uncoveredUnknown.length > 0) {
    reasons.push(
      `Unknown passive metadata is not represented in the keeper core: ${uncoveredUnknown.join(", ")}.`,
    );
  }

  const uncoveredHighValue = pal.passives.filter((id) => {
    const row = passiveRows.get(id);
    return Boolean(
      row &&
      row.rank >= 0 &&
      isMeaningfulPassive(row) &&
      !keepers.some((keeper) => keeper.passives.includes(id)),
    );
  });
  if (uncoveredHighValue.length > 0) {
    reasons.push(
      `High-value passive evidence is not represented in the keeper core: ${uncoveredHighValue.map((id) => displayPassive(id, passiveRows)).join(", ")}.`,
    );
  }

  const stats: Array<[StatKey, string]> = [
    ["hp", "HP"],
    ["attack", "ATK"],
    ["defense", "DEF"],
  ];
  for (const [key, label] of stats) {
    if (!keepers.some((keeper) => keeper.ivs[key] >= pal.ivs[key])) {
      reasons.push(`No protected keeper preserves ${label} IV ${pal.ivs[key]} or better.`);
    }
  }
  return reasons;
}

function likelyReasons(
  pal: OwnedPal,
  keepers: OwnedPal[],
  passiveRows: ReadonlyMap<string, PassiveEntry>,
): string[] {
  const reasons = [
    "Not selected into the keeper core; combat/worker roles, breeding core, high-value passives, special/invested copies, and species-best IVs remain protected.",
  ];

  const uncoveredLowerTier = pal.passives.filter((id) => {
    const row = passiveRows.get(id);
    return Boolean(
      row &&
      row.rank >= 0 &&
      !isMeaningfulPassive(row) &&
      !keepers.some((keeper) => keeper.passives.includes(id)),
    );
  });
  if (uncoveredLowerTier.length > 0) {
    reasons.push(
      `Would give up lower-tier/neutral passive evidence not selected for core protection: ${uncoveredLowerTier.map((id) => displayPassive(id, passiveRows)).join(", ")}.`,
    );
  }

  const uncoveredMoves = pal.active_skills.filter(
    (move) => !keepers.some((keeper) => keeper.active_skills.includes(move)),
  );
  if (uncoveredMoves.length > 0) {
    reasons.push(
      `Would give up equipped move${uncoveredMoves.length > 1 ? "s" : ""} not represented in the keeper core: ${uncoveredMoves.join(", ")}.`,
    );
  }

  reasons.push("Use your judgment if that convenience or move/passive combination matters to you.");
  return reasons;
}

/**
 * Roster-level, score-free condensation guidance.
 *
 * "Safe" means every preserved component on the candidate is still represented
 * somewhere in the protected keeper core; it no longer requires one single Pal
 * to dominate the candidate in every dimension. "Likely" is a visible middle
 * band for lower-tier passive / equipped-move convenience that is not important
 * enough to bloat the keeper core. Unknown metadata still falls to review.
 */
export function buildCondensationSummary(
  peers: OwnedPal[],
  passiveRows: ReadonlyMap<string, PassiveEntry>,
): CondensationSummary {
  if (peers.length === 0) {
    return {
      targets: [],
      safe: [],
      likely: [],
      protected: [],
      review: [],
      safeMaterialCount: 0,
      likelyMaterialCount: 0,
    };
  }

  const roles = buildSpeciesRoleSummary(peers, passiveRows);
  const targets = targetRows(roles);
  const keeperReasons = buildKeeperCore(peers, passiveRows, roles, targets);
  const keepers = allKeepers(peers, keeperReasons);
  const safe: CondensationMaterial[] = [];
  const likely: CondensationMaterial[] = [];
  const protectedRows: CondensationMaterial[] = [];
  const review: CondensationMaterial[] = [];

  for (const pal of peers) {
    const protectedReasons = keeperReasons.get(stableId(pal));
    if (protectedReasons) {
      protectedRows.push({ pal, kind: "protected", reasons: protectedReasons });
      continue;
    }

    const hardReview = reviewReasons(pal, keepers, passiveRows);
    if (hardReview.length > 0) {
      review.push({ pal, kind: "review", reasons: hardReview });
      continue;
    }

    const comparator = bestSameGenderKeeper(pal, keepers, passiveRows);
    if (coveredByKeeperCore(pal, keepers, passiveRows)) {
      safe.push({
        pal,
        kind: "safe",
        dominant: comparator,
        reasons: [
          "Safe at roster level: all positive/unknown passives, equipped moves, same-gender breeding coverage, and each IV ceiling remain represented in the protected keeper core.",
          ...(comparator
            ? [`Reference ${pal.gender?.toLowerCase()} keeper: ${palLabel(comparator)} · Condense ${comparator.rank}/4 · IV avg ${ivAverage(comparator)}.`]
            : []),
        ],
      });
      continue;
    }

    likely.push({
      pal,
      kind: "likely",
      dominant: comparator,
      reasons: likelyReasons(pal, keepers, passiveRows),
    });
  }

  return {
    targets,
    safe,
    likely,
    protected: protectedRows,
    review,
    safeMaterialCount: safe.length,
    likelyMaterialCount: likely.length,
  };
}
