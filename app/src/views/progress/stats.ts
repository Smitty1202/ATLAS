import { hexGuid, isHuman } from "../../components/palbox/selectors";
import type { MapData } from "../../lib/map-coords";
import type {
  MapState,
  OwnedPal,
  PlayerRef,
  SaveSummary,
  SpeciesEntry,
} from "../../lib/types";
import { buildPois, type DefeatCount, type PoiPin } from "../map/pins";

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
  captureCount: number;
}

export interface CaptureStats {
  totalCaptures: number;
  mostCaptured: PalCollectionItem[];
}

export interface PalCollectionProgress {
  total: number;
  captured: PalCollectionItem[];
  discovered: PalCollectionItem[];
  undiscovered: PalCollectionItem[];
  captureStats: CaptureStats;
}

export type MissingWorldObjectiveCategoryKey =
  | "fastTravel"
  | "effigies"
  | "fieldBosses"
  | "wantedFugitives"
  | "towerRegions";

export type MissingWorldObjectiveFilter =
  | "fastTravel"
  | "alpha"
  | "effigies"
  | "bounties"
  | "towers";

export interface MissingWorldObjective {
  id: string;
  name: string;
  typeLabel: string;
  detail: string;
  level?: number;
  layer: string;
  x: number;
  y: number;
  focusFilter: MissingWorldObjectiveFilter;
}

export interface MissingWorldObjectiveCategory {
  key: MissingWorldObjectiveCategoryKey;
  label: string;
  found: number;
  total: number;
  joined: boolean;
  missing: MissingWorldObjective[];
}

export interface MissingWorldObjectivesProgress {
  categories: MissingWorldObjectiveCategory[];
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
): {
  captured: Set<string>;
  unlocked: Set<string>;
  captureCounts: Map<string, number>;
  totalCaptures: number;
} {
  const captured = new Set<string>();
  const unlocked = new Set<string>();
  const captureCounts = new Map<string, number>();
  let totalCaptures = 0;
  for (const player of scopedPlayers(summary, playerScope)) {
    for (const entry of player.pal_capture_counts ?? []) {
      const count = entry.count ?? 0;
      if (count > 0 && (!speciesIds || speciesIds.has(entry.species_id))) {
        const current = captureCounts.get(entry.species_id) ?? 0;
        captureCounts.set(entry.species_id, current + count);
        totalCaptures += count;
        captured.add(entry.species_id);
      }
    }
    for (const speciesId of player.paldeck_unlocked ?? []) {
      if (!speciesIds || speciesIds.has(speciesId)) {
        unlocked.add(speciesId);
      }
    }
  }
  return { captured, unlocked, captureCounts, totalCaptures };
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

function hasGuid(point: { guid?: string | null }): boolean {
  return typeof point.guid === "string" && point.guid.trim() !== "";
}

function allHaveGuid(points: { guid?: string | null }[]): boolean {
  return points.length > 0 && points.every(hasGuid);
}

function allHaveKey(points: { key?: string | null }[]): boolean {
  return points.length > 0 && points.every((p) => !!p.key?.trim());
}

function humanizeToken(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/^EPalRelicType::/, "")
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function pinObjective(
  pin: PoiPin,
  typeLabel: string,
  detail: string,
  focusFilter: MissingWorldObjectiveFilter,
  name: string | null | undefined,
): MissingWorldObjective {
  return {
    id: `${pin.kind}:${pin.key}`,
    name: name?.trim() || typeLabel,
    typeLabel,
    detail,
    ...(pin.level != null ? { level: pin.level } : {}),
    layer: pin.map,
    x: pin.x,
    y: pin.y,
    focusFilter,
  };
}

function missingFromPins(
  pins: PoiPin[],
  kind: PoiPin["kind"],
  joined: boolean,
  toObjective: (pin: PoiPin) => MissingWorldObjective,
): MissingWorldObjective[] {
  if (!joined) return [];
  return pins.filter((pin) => pin.kind === kind && !pin.found).map(toObjective);
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

export function buildMissingWorldObjectives(
  mapData: MapData,
  mapState: MapState,
  playerScope: string,
  species: SpeciesEntry[],
): MissingWorldObjectivesProgress {
  const { pins, counts } = buildPois(mapData, mapState, playerScope);
  const speciesNames = new Map(species.map((sp) => [sp.id, sp.name]));
  const fastTravelJoined = allHaveGuid(mapData.fast_travel);
  const effigiesJoined = allHaveGuid(mapData.effigies);
  const fieldBosses = counts.fieldBosses ?? {
    found: 0,
    total: mapData.bosses.length,
    joined: false,
  };
  const wantedFugitives = counts.wantedFugitives ?? {
    found: 0,
    total: mapData.bounties?.length ?? 0,
    joined: false,
  };
  const towers = mapData.towers ?? [];
  const towerJoined = allHaveKey(towers);

  return {
    categories: [
      {
        key: "fastTravel",
        label: "Fast Travel",
        found: counts.fastTravel.found,
        total: counts.fastTravel.total,
        joined: fastTravelJoined,
        missing: missingFromPins(pins, "fast_travel", fastTravelJoined, (pin) =>
          pinObjective(
            pin,
            "Fast Travel",
            "Locked",
            "fastTravel",
            pin.name ?? "Fast Travel Point",
          ),
        ),
      },
      {
        key: "effigies",
        label: "Effigies",
        found: counts.effigies.found,
        total: counts.effigies.total,
        joined: effigiesJoined,
        missing: missingFromPins(pins, "effigy", effigiesJoined, (pin) =>
          pinObjective(
            pin,
            "Effigy",
            humanizeToken(pin.effigyType) || "Uncollected",
            "effigies",
            pin.name ?? "Effigy",
          ),
        ),
      },
      {
        key: "fieldBosses",
        label: "Field Bosses",
        found: fieldBosses.found,
        total: fieldBosses.total,
        joined: fieldBosses.joined,
        missing: missingFromPins(pins, "alpha", fieldBosses.joined, (pin) => {
          const speciesName = pin.speciesId
            ? speciesNames.get(pin.speciesId) ?? pin.speciesId
            : null;
          return pinObjective(
            pin,
            "Field Boss",
            pin.level != null ? `Lv ${pin.level}` : "Defeat not recorded",
            "alpha",
            speciesName,
          );
        }),
      },
      {
        key: "wantedFugitives",
        label: "Wanted Fugitives",
        found: wantedFugitives.found,
        total: wantedFugitives.total,
        joined: wantedFugitives.joined,
        missing: missingFromPins(
          pins,
          "bounty",
          wantedFugitives.joined,
          (pin) =>
            pinObjective(
              pin,
              "Wanted Fugitive",
              "Defeat not recorded",
              "bounties",
              pin.name ?? "Wanted Fugitive",
            ),
        ),
      },
      {
        key: "towerRegions",
        label: "Tower Regions",
        found: counts.towers.found,
        total: counts.towers.total,
        joined: towerJoined,
        missing: missingFromPins(pins, "tower", towerJoined, (pin) =>
          pinObjective(
            pin,
            "Tower Region",
            "Not reached",
            "towers",
            pin.name ?? "Syndicate Tower",
          ),
        ),
      },
    ],
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
    captureStats: {
      totalCaptures: lifetime.totalCaptures,
      mostCaptured: [],
    },
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
      captureCount: lifetime.captureCounts.get(sp.id) ?? 0,
    };
    if (lifetime.captured.has(sp.id)) {
      out.captured.push(item);
    } else if (lifetime.unlocked.has(sp.id)) {
      out.discovered.push(item);
    } else {
      out.undiscovered.push(item);
    }
  }

  out.captureStats.mostCaptured = [...out.captured]
    .sort(
      (a, b) =>
        b.captureCount - a.captureCount ||
        (a.paldexNo ?? Number.MAX_SAFE_INTEGER) -
          (b.paldexNo ?? Number.MAX_SAFE_INTEGER) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, 10);

  return out;
}
