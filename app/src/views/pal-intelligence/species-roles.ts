import { isAlpha, type OwnedPal, type PassiveEntry } from "../../lib/types";

export type IntelligenceRole = "combat" | "worker";

export interface SpeciesRolePick {
  pal: OwnedPal;
  reasons: string[];
}

export interface BreedingCore {
  male: SpeciesRolePick | null;
  female: SpeciesRolePick | null;
}

export interface SpeciesRoleSummary {
  combat: SpeciesRolePick | null;
  worker: SpeciesRolePick | null;
  breeding: BreedingCore;
}

const COMBAT_EFFECTS = new Set([
  "ShotAttack",
  "Defense",
  "MaxHP",
  "LifeSteal",
  "ActiveSkillCoolTime_Decrease",
  "MoveSpeed",
  "ExplosionResist",
  "KnockbackInvalid_ForPassiveSkill",
  "LeanBackInvalid_ForPassiveSkill",
  "ResistAdditionalEffect_Burn",
  "ResistAdditionalEffect_Poison",
]);

const WORK_PRODUCTIVITY_EFFECTS = new Set([
  "CraftSpeed",
  "MoveSpeed",
  "MaxInventoryWeight",
  "CollectItem",
  "CollectItemDrop_NaturalObject",
  "Nocturnal",
  "NightOwl",
  "Logging",
  "Mining",
  "WorkSuitabilityAddRank_MonsterFarm",
  "BreedSpeed",
  "BreedSpeed_InBaseCamp",
  "PalEggHatchingSpeed",
]);

const WORK_SUSTAINABILITY_EFFECTS = new Set([
  "Sanity_Decrease",
  "FullStomatch_Decrease",
]);

function ivAverage(pal: OwnedPal): number {
  return Math.round((pal.ivs.hp + pal.ivs.attack + pal.ivs.defense) / 3);
}

function stableId(pal: OwnedPal): string {
  return pal.instance_id.map((value) => value.toString(16).padStart(2, "0")).join("");
}

function passiveRowsForPal(
  pal: OwnedPal,
  passiveRows: ReadonlyMap<string, PassiveEntry>,
): PassiveEntry[] {
  return pal.passives
    .map((id) => passiveRows.get(id))
    .filter((row): row is PassiveEntry => Boolean(row));
}

function positiveRows(
  pal: OwnedPal,
  passiveRows: ReadonlyMap<string, PassiveEntry>,
): PassiveEntry[] {
  return passiveRowsForPal(pal, passiveRows).filter((row) => row.rank >= 0);
}

function negativeCount(
  pal: OwnedPal,
  passiveRows: ReadonlyMap<string, PassiveEntry>,
): number {
  return passiveRowsForPal(pal, passiveRows).filter((row) => row.rank < 0).length;
}

function isHighTier(row: PassiveEntry): boolean {
  return row.rank >= 3 || row.tier === "rainbow" || row.tier === "worldtree";
}

function isCombatPassive(row: PassiveEntry): boolean {
  return row.rank > 0 && row.effects.some((effect) =>
    COMBAT_EFFECTS.has(effect.type) ||
    effect.type.startsWith("ElementBoost_") ||
    effect.type.startsWith("ElementResist_"),
  );
}

function isWorkProductivityPassive(row: PassiveEntry): boolean {
  return row.rank > 0 && row.effects.some((effect) => WORK_PRODUCTIVITY_EFFECTS.has(effect.type));
}

function isWorkSustainabilityPassive(row: PassiveEntry): boolean {
  return row.rank > 0 && row.effects.some((effect) => WORK_SUSTAINABILITY_EFFECTS.has(effect.type));
}

function relevantRows(
  pal: OwnedPal,
  passiveRows: ReadonlyMap<string, PassiveEntry>,
  predicate: (row: PassiveEntry) => boolean,
): PassiveEntry[] {
  return passiveRowsForPal(pal, passiveRows).filter(predicate);
}

function rankVector(rows: PassiveEntry[]): number[] {
  return rows.map((row) => row.rank).sort((a, b) => b - a);
}

function compareRankVectors(a: number[], b: number[]): number {
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const left = a[index] ?? -Infinity;
    const right = b[index] ?? -Infinity;
    if (left !== right) return right - left;
  }
  return 0;
}

function passiveLabel(row: PassiveEntry): string {
  const tier = row.tier === "worldtree" ? "World Tree" : row.tier === "rainbow" ? "Rainbow" : `R${row.rank}`;
  return `${row.name} (${tier})`;
}

function palLabel(pal: OwnedPal): string {
  return pal.nickname ? `“${pal.nickname}”` : `Lv ${pal.level}`;
}

interface RoleEvidence {
  pal: OwnedPal;
  rows: PassiveEntry[];
  highTier: number;
  ranks: number[];
}

function roleEvidence(
  pal: OwnedPal,
  passiveRows: ReadonlyMap<string, PassiveEntry>,
  predicate: (row: PassiveEntry) => boolean,
): RoleEvidence {
  const rows = relevantRows(pal, passiveRows, predicate);
  return {
    pal,
    rows,
    highTier: rows.filter(isHighTier).length,
    ranks: rankVector(rows),
  };
}

function compareCombat(a: RoleEvidence, b: RoleEvidence): number {
  return (
    b.highTier - a.highTier ||
    b.rows.length - a.rows.length ||
    compareRankVectors(a.ranks, b.ranks) ||
    b.pal.ivs.attack - a.pal.ivs.attack ||
    Number(isAlpha(b.pal)) - Number(isAlpha(a.pal)) ||
    (b.pal.ivs.hp + b.pal.ivs.defense) - (a.pal.ivs.hp + a.pal.ivs.defense) ||
    b.pal.rank - a.pal.rank ||
    b.pal.level - a.pal.level ||
    stableId(a.pal).localeCompare(stableId(b.pal))
  );
}

interface WorkerEvidence {
  pal: OwnedPal;
  productivity: RoleEvidence;
  sustainability: RoleEvidence;
}

function workerEvidence(
  pal: OwnedPal,
  passiveRows: ReadonlyMap<string, PassiveEntry>,
): WorkerEvidence {
  return {
    pal,
    productivity: roleEvidence(pal, passiveRows, isWorkProductivityPassive),
    sustainability: roleEvidence(pal, passiveRows, isWorkSustainabilityPassive),
  };
}

function compareWorker(
  a: WorkerEvidence,
  b: WorkerEvidence,
  passiveRows: ReadonlyMap<string, PassiveEntry>,
): number {
  return (
    b.productivity.highTier - a.productivity.highTier ||
    b.productivity.rows.length - a.productivity.rows.length ||
    compareRankVectors(a.productivity.ranks, b.productivity.ranks) ||
    b.sustainability.highTier - a.sustainability.highTier ||
    b.sustainability.rows.length - a.sustainability.rows.length ||
    compareRankVectors(a.sustainability.ranks, b.sustainability.ranks) ||
    b.pal.rank - a.pal.rank ||
    negativeCount(a.pal, passiveRows) - negativeCount(b.pal, passiveRows) ||
    b.pal.level - a.pal.level ||
    ivAverage(b.pal) - ivAverage(a.pal) ||
    stableId(a.pal).localeCompare(stableId(b.pal))
  );
}

function combatPick(
  peers: OwnedPal[],
  passiveRows: ReadonlyMap<string, PassiveEntry>,
): SpeciesRolePick | null {
  if (peers.length === 0) return null;
  const evidence = peers.map((pal) => roleEvidence(pal, passiveRows, isCombatPassive));
  evidence.sort(compareCombat);
  const best = evidence[0]!;
  const bestAttack = Math.max(...peers.map((pal) => pal.ivs.attack));

  const reasons: string[] = [];
  if (best.rows.length > 0) {
    reasons.push(`Combat passives: ${best.rows.map(passiveLabel).join(", ")}.`);
  } else {
    reasons.push("No owned copy has a positive combat-specific passive; IVs break the tie.");
  }
  reasons.push(`ATK IV ${best.pal.ivs.attack}${best.pal.ivs.attack === bestAttack ? " · species best" : ""}; HP ${best.pal.ivs.hp}; DEF ${best.pal.ivs.defense}.`);
  if (isAlpha(best.pal)) reasons.push("Alpha / rare status is preserved on this combat pick.");
  if (best.pal.rank > 0) reasons.push(`Condensed ${best.pal.rank}/4.`);
  return { pal: best.pal, reasons };
}

function workerPick(
  peers: OwnedPal[],
  passiveRows: ReadonlyMap<string, PassiveEntry>,
): SpeciesRolePick | null {
  if (peers.length === 0) return null;
  const evidence = peers.map((pal) => workerEvidence(pal, passiveRows));
  evidence.sort((a, b) => compareWorker(a, b, passiveRows));
  const best = evidence[0]!;
  const reasons: string[] = [];

  if (best.productivity.rows.length > 0) {
    reasons.push(`Productivity passives: ${best.productivity.rows.map(passiveLabel).join(", ")}.`);
  } else {
    reasons.push("No owned copy has a positive productivity passive; worker support and investment break the tie.");
  }
  if (best.sustainability.rows.length > 0) {
    reasons.push(`Worker sustainability: ${best.sustainability.rows.map(passiveLabel).join(", ")}.`);
  }
  if (best.pal.rank > 0) reasons.push(`Condensed ${best.pal.rank}/4; preserves existing investment.`);
  const penalties = negativeCount(best.pal, passiveRows);
  reasons.push(`${penalties === 0 ? "No" : penalties} negative passive${penalties === 1 ? "" : "s"} recorded.`);
  return { pal: best.pal, reasons };
}

interface BreedingEvidence {
  pal: OwnedPal;
  uniquePositive: PassiveEntry[];
  speciesBestIvs: string[];
  highTier: PassiveEntry[];
  positiveCount: number;
  negativeCount: number;
}

function breedingEvidence(
  pal: OwnedPal,
  peers: OwnedPal[],
  passiveRows: ReadonlyMap<string, PassiveEntry>,
): BreedingEvidence {
  const positive = positiveRows(pal, passiveRows);
  const uniquePositive = positive.filter(
    (row) => !peers.some((peer) => peer !== pal && peer.passives.includes(row.id)),
  );
  const bestHp = Math.max(...peers.map((peer) => peer.ivs.hp));
  const bestAttack = Math.max(...peers.map((peer) => peer.ivs.attack));
  const bestDefense = Math.max(...peers.map((peer) => peer.ivs.defense));
  const speciesBestIvs = [
    pal.ivs.hp === bestHp ? `HP ${pal.ivs.hp}` : null,
    pal.ivs.attack === bestAttack ? `ATK ${pal.ivs.attack}` : null,
    pal.ivs.defense === bestDefense ? `DEF ${pal.ivs.defense}` : null,
  ].filter((value): value is string => Boolean(value));
  return {
    pal,
    uniquePositive,
    speciesBestIvs,
    highTier: positive.filter(isHighTier),
    positiveCount: positive.length,
    negativeCount: negativeCount(pal, passiveRows),
  };
}

function compareBreeding(a: BreedingEvidence, b: BreedingEvidence): number {
  return (
    b.uniquePositive.length - a.uniquePositive.length ||
    b.speciesBestIvs.length - a.speciesBestIvs.length ||
    b.highTier.length - a.highTier.length ||
    b.positiveCount - a.positiveCount ||
    ivAverage(b.pal) - ivAverage(a.pal) ||
    b.pal.rank - a.pal.rank ||
    b.pal.level - a.pal.level ||
    a.negativeCount - b.negativeCount ||
    stableId(a.pal).localeCompare(stableId(b.pal))
  );
}

function breedingPick(
  candidates: OwnedPal[],
  peers: OwnedPal[],
  passiveRows: ReadonlyMap<string, PassiveEntry>,
): SpeciesRolePick | null {
  if (candidates.length === 0) return null;
  const evidence = candidates.map((pal) => breedingEvidence(pal, peers, passiveRows));
  evidence.sort(compareBreeding);
  const best = evidence[0]!;
  const reasons: string[] = [];
  if (best.uniquePositive.length > 0) {
    reasons.push(`Unique positive passive${best.uniquePositive.length > 1 ? "s" : ""}: ${best.uniquePositive.map(passiveLabel).join(", ")}.`);
  }
  if (best.speciesBestIvs.length > 0) {
    reasons.push(`Species-best IV coverage: ${best.speciesBestIvs.join(", ")}.`);
  }
  if (best.highTier.length > 0) {
    reasons.push(`High-tier breeding material: ${best.highTier.map(passiveLabel).join(", ")}.`);
  }
  if (reasons.length === 0) {
    reasons.push(`Best remaining ${best.pal.gender?.toLowerCase() ?? "ungendered"} breeding profile by positive passives and IV average (${ivAverage(best.pal)}).`);
  }
  if (candidates.length === 1) {
    reasons.push(`Only owned ${best.pal.gender?.toLowerCase() ?? "ungendered"} copy.`);
  }
  return { pal: best.pal, reasons };
}

export function roleTargetPassiveNames(
  role: IntelligenceRole,
  pal: OwnedPal,
  passiveRows: ReadonlyMap<string, PassiveEntry>,
): string[] {
  const rows =
    role === "combat"
      ? relevantRows(pal, passiveRows, isCombatPassive)
      : [
          ...relevantRows(pal, passiveRows, isWorkProductivityPassive),
          ...relevantRows(pal, passiveRows, isWorkSustainabilityPassive),
        ];
  return [...new Set(rows.map((row) => row.name))];
}

export function buildSpeciesRoleSummary(
  peers: OwnedPal[],
  passiveRows: ReadonlyMap<string, PassiveEntry>,
): SpeciesRoleSummary {
  const males = peers.filter((pal) => pal.gender === "Male");
  const females = peers.filter((pal) => pal.gender === "Female");
  return {
    combat: combatPick(peers, passiveRows),
    worker: workerPick(peers, passiveRows),
    breeding: {
      male: breedingPick(males, peers, passiveRows),
      female: breedingPick(females, peers, passiveRows),
    },
  };
}

export function rolePalLabel(pal: OwnedPal): string {
  const gender = pal.gender === "Male" ? "♂" : pal.gender === "Female" ? "♀" : "";
  return `${palLabel(pal)}${gender ? ` ${gender}` : ""}`;
}
