import {
  isAlpha,
  type OwnedPal,
  type PassiveEntry,
  type SpeciesEntry,
} from "../../lib/types";
import {
  combatPassiveRows,
  workProductivityPassiveRows,
} from "./species-roles";

export type RosterRole = "mining" | "lumbering" | "transporting" | "combat";
export type CoverageKind = "healthy" | "thin" | "weak" | "missing";

export interface RosterRoleCandidate {
  pal: OwnedPal;
  species: SpeciesEntry;
  role: RosterRole;
  reasons: string[];
  suitability: number | null;
  relevantPassives: PassiveEntry[];
}

export interface RosterRoleSummary {
  role: RosterRole;
  label: string;
  coverage: CoverageKind;
  coverageReason: string;
  candidates: RosterRoleCandidate[];
}

export interface RosterIntelligenceSummary {
  roles: RosterRoleSummary[];
}

const WORK_ROLE_CONFIG: Record<
  Exclude<RosterRole, "combat">,
  {
    label: string;
    workIndex: number;
    specificEffects: Set<string>;
  }
> = {
  mining: {
    label: "Mining",
    workIndex: 7,
    specificEffects: new Set(["Mining"]),
  },
  lumbering: {
    label: "Lumbering",
    workIndex: 6,
    specificEffects: new Set(["Logging"]),
  },
  transporting: {
    label: "Transporting",
    workIndex: 10,
    specificEffects: new Set([
      "MoveSpeed",
      "MaxInventoryWeight",
      "CollectItem",
      "CollectItemDrop_NaturalObject",
    ]),
  },
};

function stableId(pal: OwnedPal): string {
  return pal.instance_id.map((value) => value.toString(16).padStart(2, "0")).join("");
}

function highTier(row: PassiveEntry): boolean {
  return row.rank >= 3 || row.tier === "rainbow" || row.tier === "worldtree";
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
  if (row.tier === "worldtree") return `${row.name} (World Tree)`;
  if (row.tier === "rainbow") return `${row.name} (Rainbow)`;
  return `${row.name} (R${row.rank})`;
}

function workSuitability(species: SpeciesEntry, workIndex: number): number {
  return species.work_suitability[workIndex] ?? 0;
}

interface WorkEvidence {
  pal: OwnedPal;
  species: SpeciesEntry;
  suitability: number;
  specific: PassiveEntry[];
  support: PassiveEntry[];
}

function workEvidence(
  pal: OwnedPal,
  species: SpeciesEntry,
  role: Exclude<RosterRole, "combat">,
  passiveRows: ReadonlyMap<string, PassiveEntry>,
): WorkEvidence {
  const config = WORK_ROLE_CONFIG[role];
  const productivity = workProductivityPassiveRows(pal, passiveRows);
  const specific = productivity.filter((row) =>
    row.effects.some((effect) => config.specificEffects.has(effect.type)),
  );
  const specificIds = new Set(specific.map((row) => row.id));
  const support = productivity.filter((row) => !specificIds.has(row.id));
  return {
    pal,
    species,
    suitability: workSuitability(species, config.workIndex),
    specific,
    support,
  };
}

function compareWork(a: WorkEvidence, b: WorkEvidence, role: Exclude<RosterRole, "combat">): number {
  const aSpecificRanks = rankVector(a.specific);
  const bSpecificRanks = rankVector(b.specific);
  const aSupportRanks = rankVector(a.support);
  const bSupportRanks = rankVector(b.support);
  return (
    b.suitability - a.suitability ||
    b.specific.filter(highTier).length - a.specific.filter(highTier).length ||
    b.specific.length - a.specific.length ||
    compareRankVectors(aSpecificRanks, bSpecificRanks) ||
    b.support.filter(highTier).length - a.support.filter(highTier).length ||
    b.support.length - a.support.length ||
    compareRankVectors(aSupportRanks, bSupportRanks) ||
    (role === "transporting"
      ? b.species.stats.transport_speed - a.species.stats.transport_speed
      : 0) ||
    b.pal.rank - a.pal.rank ||
    b.pal.level - a.pal.level ||
    stableId(a.pal).localeCompare(stableId(b.pal))
  );
}

function workReasons(evidence: WorkEvidence, role: Exclude<RosterRole, "combat">): string[] {
  const config = WORK_ROLE_CONFIG[role];
  const reasons = [`${config.label} suitability Lv${evidence.suitability}.`];
  if (evidence.specific.length > 0) {
    const lead = role === "transporting" ? "Transport support" : `${config.label}-specific passives`;
    reasons.push(`${lead}: ${evidence.specific.map(passiveLabel).join(", ")}.`);
  }
  if (evidence.support.length > 0) {
    reasons.push(`General work support: ${evidence.support.map(passiveLabel).join(", ")}.`);
  }
  if (role === "transporting" && evidence.species.stats.transport_speed >= 0) {
    reasons.push(`Species transport speed ${evidence.species.stats.transport_speed}.`);
  }
  if (evidence.pal.rank > 0) reasons.push(`Condense ${evidence.pal.rank}/4 investment.`);
  return reasons;
}

interface CombatEvidence {
  pal: OwnedPal;
  species: SpeciesEntry;
  passives: PassiveEntry[];
}

function combatEvidence(
  pal: OwnedPal,
  species: SpeciesEntry,
  passiveRows: ReadonlyMap<string, PassiveEntry>,
): CombatEvidence {
  return {
    pal,
    species,
    passives: combatPassiveRows(pal, passiveRows),
  };
}

function compareCombat(a: CombatEvidence, b: CombatEvidence): number {
  return (
    b.passives.filter(highTier).length - a.passives.filter(highTier).length ||
    b.passives.length - a.passives.length ||
    compareRankVectors(rankVector(a.passives), rankVector(b.passives)) ||
    b.species.stats.attack - a.species.stats.attack ||
    b.pal.ivs.attack - a.pal.ivs.attack ||
    Number(isAlpha(b.pal)) - Number(isAlpha(a.pal)) ||
    (b.species.stats.hp + b.species.stats.defense) - (a.species.stats.hp + a.species.stats.defense) ||
    (b.pal.ivs.hp + b.pal.ivs.defense) - (a.pal.ivs.hp + a.pal.ivs.defense) ||
    b.pal.rank - a.pal.rank ||
    b.pal.level - a.pal.level ||
    stableId(a.pal).localeCompare(stableId(b.pal))
  );
}

function combatReasons(evidence: CombatEvidence): string[] {
  const reasons: string[] = [];
  if (evidence.passives.length > 0) {
    reasons.push(`Combat passives: ${evidence.passives.map(passiveLabel).join(", ")}.`);
  } else {
    reasons.push("No explicit positive combat passive; ranked by species combat stats and owned IVs.");
  }
  reasons.push(
    `Base ATK ${evidence.species.stats.attack} · ATK IV ${evidence.pal.ivs.attack}; base HP/DEF ${evidence.species.stats.hp}/${evidence.species.stats.defense}.`,
  );
  if (isAlpha(evidence.pal)) reasons.push("Alpha / rare status adds combat value.");
  if (evidence.pal.rank > 0) reasons.push(`Condense ${evidence.pal.rank}/4 investment.`);
  return reasons;
}

function bestPerSpecies<T extends { pal: OwnedPal; species: SpeciesEntry }>(
  rows: T[],
  compare: (a: T, b: T) => number,
): T[] {
  const best = new Map<string, T>();
  for (const row of rows) {
    const current = best.get(row.species.id);
    if (!current || compare(row, current) < 0) best.set(row.species.id, row);
  }
  return [...best.values()].sort(compare);
}

function workCoverage(
  role: Exclude<RosterRole, "combat">,
  rows: WorkEvidence[],
): Pick<RosterRoleSummary, "coverage" | "coverageReason"> {
  const label = WORK_ROLE_CONFIG[role].label;
  if (rows.length === 0) {
    return { coverage: "missing", coverageReason: `No owned Pal can perform ${label}.` };
  }
  const specialists = rows.filter((row) => row.suitability >= 3);
  if (specialists.length >= 2) {
    return {
      coverage: "healthy",
      coverageReason: `${specialists.length} owned species provide ${label} suitability Lv3+ specialist coverage.`,
    };
  }
  if (specialists.length === 1) {
    return {
      coverage: "thin",
      coverageReason: `Only ${specialists[0]!.species.name} reaches ${label} suitability Lv3+; specialist coverage has no backup.`,
    };
  }
  const best = rows[0]!;
  return {
    coverage: "weak",
    coverageReason: `No owned species reaches ${label} suitability Lv3; best available is ${best.species.name} at Lv${best.suitability}.`,
  };
}

function combatCoverage(rows: CombatEvidence[]): Pick<RosterRoleSummary, "coverage" | "coverageReason"> {
  if (rows.length === 0) {
    return { coverage: "missing", coverageReason: "No owned Pal is available for combat ranking." };
  }
  const tuned = rows.filter((row) => row.passives.length > 0);
  if (tuned.length >= 2) {
    return {
      coverage: "healthy",
      coverageReason: `${tuned.length} owned species carry explicit positive combat-passive evidence.`,
    };
  }
  if (tuned.length === 1) {
    return {
      coverage: "thin",
      coverageReason: `Only ${tuned[0]!.species.name} carries explicit positive combat-passive evidence; other options rely on stats/IVs.`,
    };
  }
  return {
    coverage: "weak",
    coverageReason: "No owned species carries an explicit positive combat passive; rankings fall back to species stats and IVs.",
  };
}

function buildWorkRole(
  role: Exclude<RosterRole, "combat">,
  pals: OwnedPal[],
  speciesRows: ReadonlyMap<string, SpeciesEntry>,
  passiveRows: ReadonlyMap<string, PassiveEntry>,
): RosterRoleSummary {
  const config = WORK_ROLE_CONFIG[role];
  const evidence = pals
    .map((pal) => {
      const species = speciesRows.get(pal.character_id);
      return species ? workEvidence(pal, species, role, passiveRows) : null;
    })
    .filter((row): row is WorkEvidence => Boolean(row && row.suitability > 0));
  const unique = bestPerSpecies(evidence, (a, b) => compareWork(a, b, role));
  const coverage = workCoverage(role, unique);
  return {
    role,
    label: config.label,
    ...coverage,
    candidates: unique.slice(0, 3).map((row) => ({
      pal: row.pal,
      species: row.species,
      role,
      suitability: row.suitability,
      relevantPassives: [...row.specific, ...row.support],
      reasons: workReasons(row, role),
    })),
  };
}

function buildCombatRole(
  pals: OwnedPal[],
  speciesRows: ReadonlyMap<string, SpeciesEntry>,
  passiveRows: ReadonlyMap<string, PassiveEntry>,
): RosterRoleSummary {
  const evidence = pals
    .map((pal) => {
      const species = speciesRows.get(pal.character_id);
      return species ? combatEvidence(pal, species, passiveRows) : null;
    })
    .filter((row): row is CombatEvidence => Boolean(row));
  const unique = bestPerSpecies(evidence, compareCombat);
  const coverage = combatCoverage(unique);
  return {
    role: "combat",
    label: "Combat",
    ...coverage,
    candidates: unique.slice(0, 3).map((row) => ({
      pal: row.pal,
      species: row.species,
      role: "combat",
      suitability: null,
      relevantPassives: row.passives,
      reasons: combatReasons(row),
    })),
  };
}

export function buildRosterIntelligence(
  pals: OwnedPal[],
  speciesRows: ReadonlyMap<string, SpeciesEntry>,
  passiveRows: ReadonlyMap<string, PassiveEntry>,
): RosterIntelligenceSummary {
  const usable = pals.filter((pal) => !pal.is_human);
  return {
    roles: [
      buildWorkRole("mining", usable, speciesRows, passiveRows),
      buildWorkRole("lumbering", usable, speciesRows, passiveRows),
      buildWorkRole("transporting", usable, speciesRows, passiveRows),
      buildCombatRole(usable, speciesRows, passiveRows),
    ],
  };
}
