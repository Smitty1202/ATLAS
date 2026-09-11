import { isAlpha, type ContainerKind, type OwnedPal, type SaveSummary } from "../../lib/types";
import { hexGuid } from "../../components/palbox/selectors";

export type IntelSortKey = "count" | "name" | "level" | "iv";
export type IntelInstanceSortKey = "iv" | "level" | "location" | "rank" | "alpha";
export type IntelSpecialFilter = "all" | "alpha" | "lucky" | "boss";
export type IntelLocationFilter = "all" | ContainerKind;

export interface IntelInstanceFilters {
  special: IntelSpecialFilter;
  location: IntelLocationFilter;
}

export interface IntelPassiveCount {
  id: string;
  count: number;
}

export interface IntelLocationCount {
  kind: ContainerKind;
  count: number;
}

export interface IntelSpeciesGroup {
  species_id: string;
  name: string;
  count: number;
  instances: OwnedPal[];
  alpha_count: number;
  lucky_count: number;
  boss_count: number;
  male_count: number;
  female_count: number;
  unknown_gender_count: number;
  level_min: number;
  level_max: number;
  rank_max: number;
  best_iv_average: number;
  iv_ranges: {
    hp: [number, number];
    attack: [number, number];
    defense: [number, number];
  };
  passives: IntelPassiveCount[];
  locations: IntelLocationCount[];
}

function ivAverage(pal: OwnedPal): number {
  return Math.round((pal.ivs.hp + pal.ivs.attack + pal.ivs.defense) / 3);
}

/**
 * Scope the authoritative SaveSummary population for Pal Intelligence.
 * Captured humans are intentionally excluded from every Pal aggregate.
 * A player scope includes their directly-owned Pals plus workers in any base
 * whose guild membership contains that player, mirroring Save Inspector's
 * guild/base visibility instead of silently dropping working Pals.
 */
export function scopedIntelPals(summary: SaveSummary, playerScope: string): OwnedPal[] {
  const baseContainers = new Set(
    summary.bases
      .filter((base) => playerScope === "all" || base.member_uids.includes(playerScope))
      .map((base) => base.container_id),
  );

  return summary.pals.filter((pal) => {
    if (pal.is_human) return false;
    if (playerScope === "all") return true;

    if (pal.owner_player_uid && hexGuid(pal.owner_player_uid) === playerScope) {
      return true;
    }

    return (
      pal.container_kind === "Base" &&
      pal.container_id !== null &&
      baseContainers.has(hexGuid(pal.container_id))
    );
  });
}

export function applyIntelInstanceFilters(
  pals: OwnedPal[],
  filters: IntelInstanceFilters,
): OwnedPal[] {
  return pals.filter((pal) => {
    if (filters.location !== "all" && pal.container_kind !== filters.location) {
      return false;
    }

    switch (filters.special) {
      case "alpha":
        return isAlpha(pal);
      case "lucky":
        return pal.is_lucky;
      case "boss":
        return pal.is_boss;
      default:
        return true;
    }
  });
}

/** Build species-first aggregates without losing any instance-level records. */
export function buildIntelGroups(
  pals: OwnedPal[],
  speciesNames: ReadonlyMap<string, string>,
): IntelSpeciesGroup[] {
  const bySpecies = new Map<string, OwnedPal[]>();
  for (const pal of pals) {
    if (pal.is_human) continue;
    const bucket = bySpecies.get(pal.character_id);
    if (bucket) bucket.push(pal);
    else bySpecies.set(pal.character_id, [pal]);
  }

  return [...bySpecies.entries()].map(([speciesId, instances]) => {
    const passiveCounts = new Map<string, number>();
    const locationCounts = new Map<ContainerKind, number>();
    let hpMin = 100;
    let hpMax = 0;
    let atkMin = 100;
    let atkMax = 0;
    let defMin = 100;
    let defMax = 0;

    for (const pal of instances) {
      for (const passive of pal.passives) {
        passiveCounts.set(passive, (passiveCounts.get(passive) ?? 0) + 1);
      }
      locationCounts.set(
        pal.container_kind,
        (locationCounts.get(pal.container_kind) ?? 0) + 1,
      );
      hpMin = Math.min(hpMin, pal.ivs.hp);
      hpMax = Math.max(hpMax, pal.ivs.hp);
      atkMin = Math.min(atkMin, pal.ivs.attack);
      atkMax = Math.max(atkMax, pal.ivs.attack);
      defMin = Math.min(defMin, pal.ivs.defense);
      defMax = Math.max(defMax, pal.ivs.defense);
    }

    const sortedInstances = sortIntelInstances(instances, "iv");

    return {
      species_id: speciesId,
      name: speciesNames.get(speciesId) ?? speciesId,
      count: instances.length,
      instances: sortedInstances,
      alpha_count: instances.filter(isAlpha).length,
      lucky_count: instances.filter((pal) => pal.is_lucky).length,
      boss_count: instances.filter((pal) => pal.is_boss).length,
      male_count: instances.filter((pal) => pal.gender === "Male").length,
      female_count: instances.filter((pal) => pal.gender === "Female").length,
      unknown_gender_count: instances.filter((pal) => pal.gender === null).length,
      level_min: Math.min(...instances.map((pal) => pal.level)),
      level_max: Math.max(...instances.map((pal) => pal.level)),
      rank_max: Math.max(...instances.map((pal) => pal.rank)),
      best_iv_average: Math.max(...instances.map(ivAverage)),
      iv_ranges: {
        hp: [hpMin, hpMax],
        attack: [atkMin, atkMax],
        defense: [defMin, defMax],
      },
      passives: [...passiveCounts.entries()]
        .map(([id, count]) => ({ id, count }))
        .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id)),
      locations: [...locationCounts.entries()]
        .map(([kind, count]) => ({ kind, count }))
        .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind)),
    };
  });
}

export function filterIntelGroups(
  groups: IntelSpeciesGroup[],
  search: string,
  passiveNames: ReadonlyMap<string, string>,
): IntelSpeciesGroup[] {
  const needle = search.trim().toLocaleLowerCase();
  if (!needle) return groups;

  return groups.filter((group) => {
    if (group.name.toLocaleLowerCase().includes(needle)) return true;
    if (group.species_id.toLocaleLowerCase().includes(needle)) return true;

    if (
      group.passives.some((passive) =>
        (passiveNames.get(passive.id) ?? passive.id)
          .toLocaleLowerCase()
          .includes(needle),
      )
    ) {
      return true;
    }

    return group.instances.some((pal) =>
      pal.nickname?.toLocaleLowerCase().includes(needle),
    );
  });
}

export function sortIntelGroups(
  groups: IntelSpeciesGroup[],
  sortKey: IntelSortKey,
): IntelSpeciesGroup[] {
  const rows = [...groups];
  rows.sort((a, b) => {
    switch (sortKey) {
      case "name":
        return a.name.localeCompare(b.name) || b.count - a.count;
      case "level":
        return b.level_max - a.level_max || b.count - a.count || a.name.localeCompare(b.name);
      case "iv":
        return b.best_iv_average - a.best_iv_average || b.count - a.count || a.name.localeCompare(b.name);
      default:
        return b.count - a.count || a.name.localeCompare(b.name);
    }
  });
  return rows;
}

/** Sort the exact instance records shown under a selected species. */
export function sortIntelInstances(
  pals: OwnedPal[],
  sortKey: IntelInstanceSortKey,
): OwnedPal[] {
  const rows = [...pals];
  rows.sort((a, b) => {
    switch (sortKey) {
      case "level":
        return b.level - a.level || ivAverage(b) - ivAverage(a);
      case "location":
        return a.container_kind.localeCompare(b.container_kind) || ivAverage(b) - ivAverage(a);
      case "rank":
        return b.rank - a.rank || ivAverage(b) - ivAverage(a);
      case "alpha":
        return Number(isAlpha(b)) - Number(isAlpha(a)) || Number(b.is_boss) - Number(a.is_boss) || Number(b.is_lucky) - Number(a.is_lucky) || ivAverage(b) - ivAverage(a);
      default:
        return ivAverage(b) - ivAverage(a) || b.level - a.level;
    }
  });
  return rows;
}
