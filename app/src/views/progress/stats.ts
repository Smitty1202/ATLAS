import { hexGuid, isHuman } from "../../components/palbox/selectors";
import type { MapData } from "../../lib/map-coords";
import type {
  MapState,
  OwnedPal,
  PlayerRef,
  SaveSummary,
  SpeciesEntry,
} from "../../lib/types";
import { buildPois, type DefeatCount } from "../map/pins";

export interface RatioStat {
  found: number;
  total: number;
}

export interface JoinedRatioStat extends RatioStat {
  joined: boolean;
}

export interface ProgressStats {
  worldName: string;
  playerCount: number;
  baseCount: number;
  ownedPalCount: number;
  capturedSpecies: RatioStat;
  fastTravel: RatioStat;
  effigies: RatioStat;
  fieldBosses: JoinedRatioStat;
  wantedFugitives: JoinedRatioStat;
  towerRegions: JoinedRatioStat;
}

export type PalCollectionBucket = "captured" | "discovered" | "undiscovered";

export interface PalCollectionItem {
  id: string;
  name: string;
  paldexNo: number;
}

export interface PalCollectionProgress {
  total: number;
  captured: PalCollectionItem[];
  discovered: PalCollectionItem[];
  undiscovered: PalCollectionItem[];
}

function ownerHex(pal: OwnedPal): string | null {
  return pal.owner_player_uid ? hexGuid(pal.owner_player_uid) : null;
}

function inScope(pal: OwnedPal, playerScope: string): boolean {
  return playerScope === "all" || ownerHex(pal) === playerScope;
}

function scopedOwnedPals(summary: SaveSummary, playerScope: string): OwnedPal[] {
  return summary.pals.filter((pal) => inScope(pal, playerScope));
}

function scopedPlayers(summary: SaveSummary, playerScope: string): PlayerRef[] {
  return playerScope === "all"
    ? summary.players
    : summary.players.filter((player) => player.uid === playerScope);
}

function scopedCapturedSpecies(
  summary: SaveSummary,
  speciesIds: Set<string>,
  playerScope: string,
): Set<string> {
  return scopedLifetimeSpecies(summary, playerScope, speciesIds).captured;
}

function scopedLifetimeSpecies(
  summary: SaveSummary,
  playerScope: string,
  speciesIds?: Set<string>,
): { captured: Set<string>; unlocked: Set<string> } {
  const captured = new Set<string>();
  const unlocked = new Set<string>();
  for (const player of scopedPlayers(summary, playerScope)) {
    for (const entry of player.pal_capture_counts ?? []) {
      if (
        (entry.count ?? 0) > 0 &&
        (!speciesIds || speciesIds.has(entry.species_id))
      ) {
        captured.add(entry.species_id);
      }
    }
    for (const speciesId of player.paldeck_unlocked ?? []) {
      if (!speciesIds || speciesIds.has(speciesId)) {
        unlocked.add(speciesId);
      }
    }
  }
  return { captured, unlocked };
}

function scopedBaseCount(summary: SaveSummary, playerScope: string): number {
  const bases = summary.bases ?? [];
  if (bases.length === 0) {
    const containers = new Set<string>();
    for (const pal of summary.pals) {
      if (pal.container_kind !== "Base" || !pal.container_id) continue;
      containers.add(hexGuid(pal.container_id));
    }
    return containers.size;
  }
  if (playerScope === "all") return bases.length;
  return bases.filter((base) => base.member_uids.includes(playerScope)).length;
}

function defeatStat(stat: DefeatCount | undefined, fallbackTotal: number): JoinedRatioStat {
  return {
    found: stat?.found ?? 0,
    total: stat?.total ?? fallbackTotal,
    joined: stat?.joined ?? false,
  };
}

export function buildProgressStats(
  summary: SaveSummary,
  species: SpeciesEntry[],
  mapData: MapData,
  mapState: MapState,
  playerScope: string,
): ProgressStats {
  const speciesIds = new Set(species.map((s) => s.id));
  const scopedPals = scopedOwnedPals(summary, playerScope).filter(
    (pal) => !isHuman(pal) && speciesIds.has(pal.character_id),
  );
  const captured = scopedCapturedSpecies(summary, speciesIds, playerScope);
  const { counts } = buildPois(mapData, mapState, playerScope);

  return {
    worldName: summary.world_name,
    playerCount: summary.players.length,
    baseCount: scopedBaseCount(summary, playerScope),
    ownedPalCount: scopedPals.length,
    capturedSpecies: {
      found: captured.size,
      total: species.length,
    },
    fastTravel: counts.fastTravel,
    effigies: counts.effigies,
    fieldBosses: defeatStat(counts.fieldBosses, counts.alphas),
    wantedFugitives: defeatStat(counts.wantedFugitives, counts.bounties),
    towerRegions: counts.towers,
  };
}

export function buildPalCollectionProgress(
  summary: SaveSummary,
  species: SpeciesEntry[],
  playerScope: string,
): PalCollectionProgress {
  const speciesIds = new Set(species.map((s) => s.id));
  const lifetime = scopedLifetimeSpecies(summary, playerScope, speciesIds);
  const out: PalCollectionProgress = {
    total: species.length,
    captured: [],
    discovered: [],
    undiscovered: [],
  };
  const rows = [...species].sort(
    (a, b) =>
      (a.paldex_no ?? Number.MAX_SAFE_INTEGER) -
        (b.paldex_no ?? Number.MAX_SAFE_INTEGER) ||
      a.name.localeCompare(b.name),
  );

  for (const sp of rows) {
    const item: PalCollectionItem = {
      id: sp.id,
      name: sp.name,
      paldexNo: sp.paldex_no,
    };
    if (lifetime.captured.has(sp.id)) {
      out.captured.push(item);
    } else if (lifetime.unlocked.has(sp.id)) {
      out.discovered.push(item);
    } else {
      out.undiscovered.push(item);
    }
  }

  return out;
}
