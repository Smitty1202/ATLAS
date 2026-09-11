import type { OwnedPal, PassiveEntry } from "../../lib/types";

export type IntelRecommendationKind = "keep" | "breeding_candidate" | "redundant";

export interface IntelRecommendation {
  kind: IntelRecommendationKind;
  label: "Keep" | "Breeding Candidate" | "Redundant";
  reasons: string[];
  dominant?: OwnedPal;
}

function ivAverage(pal: OwnedPal): number {
  return Math.round((pal.ivs.hp + pal.ivs.attack + pal.ivs.defense) / 3);
}

function passiveRank(id: string, passiveRows: ReadonlyMap<string, PassiveEntry>): number | null {
  return passiveRows.get(id)?.rank ?? null;
}

function positiveOrUnknownPassives(
  pal: OwnedPal,
  passiveRows: ReadonlyMap<string, PassiveEntry>,
): Set<string> {
  return new Set(
    pal.passives.filter((id) => {
      const rank = passiveRank(id, passiveRows);
      return rank === null || rank >= 0;
    }),
  );
}

function negativePassives(
  pal: OwnedPal,
  passiveRows: ReadonlyMap<string, PassiveEntry>,
): Set<string> {
  return new Set(pal.passives.filter((id) => (passiveRank(id, passiveRows) ?? 0) < 0));
}

function isSubset<T>(subset: ReadonlySet<T>, superset: ReadonlySet<T>): boolean {
  for (const value of subset) if (!superset.has(value)) return false;
  return true;
}

function preservesSpecialStatus(candidate: OwnedPal, target: OwnedPal): boolean {
  if (target.is_boss && !candidate.is_boss) return false;
  if (target.is_lucky && !candidate.is_lucky) return false;
  return true;
}

/**
 * Conservative same-species dominance used for the Redundant classification.
 * A candidate must preserve breeding diversity (same gender), every positive or
 * unknown passive, every equipped move, special-status traits, condensation,
 * level investment, and meet-or-beat all three IVs. Negative passives are
 * allowed to disappear, but the candidate may not introduce a new penalty.
 */
export function safelyDominates(
  candidate: OwnedPal,
  target: OwnedPal,
  passiveRows: ReadonlyMap<string, PassiveEntry>,
): boolean {
  if (candidate === target || candidate.character_id !== target.character_id) return false;
  if (candidate.gender !== target.gender) return false;
  if (!preservesSpecialStatus(candidate, target)) return false;
  if (candidate.level < target.level || candidate.rank < target.rank) return false;
  if (
    candidate.ivs.hp < target.ivs.hp ||
    candidate.ivs.attack < target.ivs.attack ||
    candidate.ivs.defense < target.ivs.defense
  ) {
    return false;
  }

  const candidatePositive = positiveOrUnknownPassives(candidate, passiveRows);
  const targetPositive = positiveOrUnknownPassives(target, passiveRows);
  if (!isSubset(targetPositive, candidatePositive)) return false;

  const candidateNegative = negativePassives(candidate, passiveRows);
  const targetNegative = negativePassives(target, passiveRows);
  if (!isSubset(candidateNegative, targetNegative)) return false;

  const candidateMoves = new Set(candidate.active_skills);
  if (!isSubset(new Set(target.active_skills), candidateMoves)) return false;

  return (
    candidate.level > target.level ||
    candidate.rank > target.rank ||
    candidate.ivs.hp > target.ivs.hp ||
    candidate.ivs.attack > target.ivs.attack ||
    candidate.ivs.defense > target.ivs.defense ||
    candidatePositive.size > targetPositive.size ||
    candidateNegative.size < targetNegative.size ||
    candidateMoves.size > new Set(target.active_skills).size ||
    (!target.is_boss && candidate.is_boss) ||
    (!target.is_lucky && candidate.is_lucky)
  );
}

function displayPassive(id: string, passiveRows: ReadonlyMap<string, PassiveEntry>): string {
  const row = passiveRows.get(id);
  if (!row) return id;
  return `${row.name} (Rank ${row.rank})`;
}

function uniquePositivePassives(
  pal: OwnedPal,
  peers: OwnedPal[],
  passiveRows: ReadonlyMap<string, PassiveEntry>,
): string[] {
  const positive = positiveOrUnknownPassives(pal, passiveRows);
  return [...positive].filter(
    (id) => !peers.some((peer) => peer !== pal && peer.passives.includes(id)),
  );
}

function uniqueMoves(pal: OwnedPal, peers: OwnedPal[]): string[] {
  return pal.active_skills.filter(
    (move) => !peers.some((peer) => peer !== pal && peer.active_skills.includes(move)),
  );
}

function rarePassives(
  pal: OwnedPal,
  passiveRows: ReadonlyMap<string, PassiveEntry>,
): PassiveEntry[] {
  return pal.passives
    .map((id) => passiveRows.get(id))
    .filter((row): row is PassiveEntry => Boolean(row))
    .filter((row) => row.rank >= 4 || row.tier === "rainbow" || row.tier === "worldtree");
}

function bestDominator(
  dominators: OwnedPal[],
): OwnedPal {
  return [...dominators].sort(
    (a, b) =>
      b.rank - a.rank ||
      ivAverage(b) - ivAverage(a) ||
      b.level - a.level ||
      b.passives.length - a.passives.length,
  )[0]!;
}

/**
 * Explainable, score-free recommendation. There is deliberately no weighted
 * numeric ranking hidden behind these labels.
 */
export function recommendIntelPal(
  pal: OwnedPal,
  peers: OwnedPal[],
  passiveRows: ReadonlyMap<string, PassiveEntry>,
): IntelRecommendation {
  const dominators = peers.filter((candidate) => safelyDominates(candidate, pal, passiveRows));
  if (dominators.length > 0) {
    const dominant = bestDominator(dominators);
    const reasons = [
      "Another same-gender copy preserves its positive passives and equipped moves while meeting or beating level, condensation, special status, and every IV.",
      `Comparator: ${dominant.nickname ? `“${dominant.nickname}” · ` : ""}Lv ${dominant.level} · Condense ${dominant.rank}/4 · IV avg ${ivAverage(dominant)}.`,
    ];
    return { kind: "redundant", label: "Redundant", reasons, dominant };
  }

  const keepReasons: string[] = [];
  if (peers.length === 1) keepReasons.push("Only owned copy of this species.");
  if (pal.rank > 0) keepReasons.push(`Condensed to ${pal.rank}/4; preserves invested copies.`);
  if (pal.is_boss) keepReasons.push("Field-boss origin is a distinct owned variant.");
  if (pal.is_lucky) keepReasons.push("Lucky / rare Alpha status is a distinct owned variant.");

  const rare = rarePassives(pal, passiveRows);
  if (rare.length > 0) {
    keepReasons.push(`Carries high-tier passive${rare.length > 1 ? "s" : ""}: ${rare.map((row) => `${row.name} (Rank ${row.rank})`).join(", ")}.`);
  }

  const maxAverage = Math.max(...peers.map(ivAverage));
  if (ivAverage(pal) === maxAverage) {
    keepReasons.push(`Best owned IV average for this species (${maxAverage}).`);
  }

  if (keepReasons.length > 0) {
    return { kind: "keep", label: "Keep", reasons: keepReasons };
  }

  const breedingReasons: string[] = [];
  const uniquePassives = uniquePositivePassives(pal, peers, passiveRows);
  if (uniquePassives.length > 0) {
    breedingReasons.push(`Unique breeding passive${uniquePassives.length > 1 ? "s" : ""}: ${uniquePassives.map((id) => displayPassive(id, passiveRows)).join(", ")}.`);
  }

  const bestHp = Math.max(...peers.map((peer) => peer.ivs.hp));
  const bestAttack = Math.max(...peers.map((peer) => peer.ivs.attack));
  const bestDefense = Math.max(...peers.map((peer) => peer.ivs.defense));
  const bestStats = [
    pal.ivs.hp === bestHp ? `HP ${pal.ivs.hp}` : null,
    pal.ivs.attack === bestAttack ? `ATK ${pal.ivs.attack}` : null,
    pal.ivs.defense === bestDefense ? `DEF ${pal.ivs.defense}` : null,
  ].filter((value): value is string => Boolean(value));
  if (bestStats.length > 0) breedingReasons.push(`Species-best individual IV: ${bestStats.join(", ")}.`);

  const moves = uniqueMoves(pal, peers);
  if (moves.length > 0) {
    breedingReasons.push(`Only owned copy carrying equipped move${moves.length > 1 ? "s" : ""}: ${moves.join(", ")}.`);
  }

  if (pal.gender && peers.filter((peer) => peer.gender === pal.gender).length === 1) {
    breedingReasons.push(`Only owned ${pal.gender.toLowerCase()} copy; preserves breeding-pair flexibility.`);
  }

  if (breedingReasons.length === 0) {
    breedingReasons.push("No same-gender copy safely dominates all preserved traits; keep as breeding diversity.");
  }

  return { kind: "breeding_candidate", label: "Breeding Candidate", reasons: breedingReasons };
}
