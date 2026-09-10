// The POI pin model + the found/unlocked join (contract R3). This turns the pak
// pin arrays (fast-travel statues, field bosses, effigies, bounties) plus the
// save's per-player flag sets into a flat, layer-tagged pin list the overlay
// renders, and computes the per-layer "found / total" counts the filter panel
// shows.
//
// R3 join semantics: each pak fast-travel / effigy POI in map-data.json carries
// a `guid` — the world-static actor instance GUID, formatted as 32-char
// UPPERCASE UE-Digits hex — that matches the keys in a player's
// `fast_travel_unlocked` / `effigies_found` flag arrays EXACTLY. A pin is
// "found/unlocked" for the current player scope iff some scoped player's flag
// set contains that pin's guid (plain string equality — no coordinate join, no
// radius). When a pin's guid is null (the extractor could not resolve one) that
// pin renders neutral, and when NO POI carries a guid at all the counts fall
// back to the raw flag-set sizes (honest "you've unlocked N" rather than a
// fabricated per-pin state).

import type { MapData } from "../../lib/map-coords";
import type { MapState } from "../../lib/types";
import { baseSpeciesId } from "../../lib/map-data";

export type PoiKind = "fast_travel" | "alpha" | "effigy" | "bounty" | "tower";

/** One resolved POI pin in world space. */
export interface PoiPin {
  key: string;
  kind: PoiKind;
  map: string;
  x: number;
  y: number;
  found: boolean;
  known: boolean;
  /** Alpha or typed-effigy Pal internal species id. */
  speciesId?: string;
  /** Canonical Palworld relic type used by the effigy-type filter. */
  effigyType?: string;
  /** Alpha only: field-boss level (hover chip). */
  level?: number;
  /** Fast-travel / effigy / bounty / tower display name. */
  name?: string | null;
}

export interface EffigyTypeCount {
  key: string;
  label: string;
  found: number;
  total: number;
}

/** Per-layer found/total counts for the filter panel rows. */
export interface PoiCounts {
  fastTravel: { found: number; total: number };
  effigies: { found: number; total: number };
  effigyTypes: EffigyTypeCount[];
  towers: { found: number; total: number; joined: boolean };
  bounties: number;
  alphas: number;
  joined: boolean;
}

function unionFlags(
  players: MapState["players"],
  scope: string,
  pick: (p: MapState["players"][number]) => string[],
): Set<string> {
  const out = new Set<string>();
  for (const p of players) {
    if (scope !== "all" && p.uid !== scope) continue;
    for (const g of pick(p)) out.add(g);
  }
  return out;
}

function humanizeCid(cid: string): string {
  return cid
    .replace(/^BOSS_/, "")
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

type EffigyPayload = {
  type?: string | null;
  class?: string | null;
};

/** Current Palworld relic-type -> Pal mapping. Unknown future types are still
 *  shown by a humanized type name rather than being mislabeled as Lifmunk. */
const EFFIGY_PAL_NAMES: Record<string, string> = {
  CapturePower: "Lifmunk",
  HungerReduction: "Lamball",
  SwimSpeed: "Pengullet",
  FoodDecayReduction: "Munchill",
  JumpPower: "Rooby",
  GliderSpeed: "Herbil",
  ClimbSpeed: "Tanzee",
  StatusAilmentResist: "Depresso",
  StaminaReduction: "Cattiva",
  SphereHoming: "Lunaris",
  ExpBonus: "Relaxaurus",
  RainbowPassiveRate: "Yakumo",
  MoveSpeed: "Mimog",
};

function effigyTypeKey(type: string | null | undefined): string {
  const key = (type ?? "CapturePower").replace(/^EPalRelicType::/, "").trim();
  return key || "Unknown";
}

function effigyDisplayName(type: string | null | undefined): string {
  const key = effigyTypeKey(type);
  const pal = EFFIGY_PAL_NAMES[key];
  if (pal) return `${pal} Effigy`;
  const human = key.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
  return `${human || "Unknown"} Effigy`;
}

function effigySpeciesId(actorClass: string | null | undefined): string | undefined {
  const match = /^BP_LevelObject_Relic_(.+)_C$/.exec(actorClass ?? "");
  return match?.[1];
}

export function buildPois(
  data: MapData,
  state: MapState | null,
  scope: string,
): { pins: PoiPin[]; counts: PoiCounts } {
  const players = state?.players ?? [];
  const unlockedFt = unionFlags(players, scope, (p) => p.fast_travel_unlocked);
  const foundEff = unionFlags(players, scope, (p) => p.effigies_found);
  const conqueredTowers = unionFlags(players, scope, (p) =>
    "towers_defeated" in p && Array.isArray(p.towers_defeated)
      ? p.towers_defeated
      : [],
  );

  const hasFtGuids = data.fast_travel.some((p) => p.guid != null);
  const hasEffGuids = data.effigies.some((p) => p.guid != null);
  const joined = hasFtGuids || hasEffGuids;

  const pins: PoiPin[] = [];
  const effigyTypeCounts = new Map<string, EffigyTypeCount>();
  let ftFound = 0;
  let effFound = 0;

  data.fast_travel.forEach((p, i) => {
    const found = p.guid != null && unlockedFt.has(p.guid);
    if (found) ftFound++;
    pins.push({
      key: `ft${i}`,
      kind: "fast_travel",
      map: p.map,
      x: p.x,
      y: p.y,
      found,
      known: found,
      name: p.name ?? null,
    });
  });

  data.effigies.forEach((p, i) => {
    const found = p.guid != null && foundEff.has(p.guid);
    if (found) effFound++;
    const typed = p as typeof p & EffigyPayload;
    const effigyType = effigyTypeKey(typed.type);
    const name = effigyDisplayName(effigyType);
    const stats = effigyTypeCounts.get(effigyType) ?? {
      key: effigyType,
      label: name.replace(/ Effigy$/, ""),
      found: 0,
      total: 0,
    };
    stats.total++;
    if (found) stats.found++;
    effigyTypeCounts.set(effigyType, stats);
    pins.push({
      key: `ef${i}`,
      kind: "effigy",
      map: p.map,
      x: p.x,
      y: p.y,
      found,
      known: found,
      name,
      effigyType,
      speciesId: effigySpeciesId(typed.class),
    });
  });

  data.bosses.forEach((b, i) => {
    pins.push({
      key: `bs${i}`,
      kind: "alpha",
      map: b.map,
      x: b.x,
      y: b.y,
      found: false,
      known: false,
      speciesId: baseSpeciesId(b.species),
      level: b.level,
    });
  });

  const bounties = data.bounties ?? [];
  bounties.forEach((p, i) => {
    pins.push({
      key: `bt${i}`,
      kind: "bounty",
      map: p.map,
      x: p.x,
      y: p.y,
      found: false,
      known: false,
      name: p.name ?? (p.cid ? humanizeCid(p.cid) : null),
    });
  });

  const towers = data.towers ?? [];
  const keyedTowers = towers.filter((t) => t.key != null).length;
  const hasTowerKeys = keyedTowers > 0;
  let towerFound = 0;
  towers.forEach((t, i) => {
    const found = t.key != null && conqueredTowers.has(t.key);
    if (found) towerFound++;
    pins.push({
      key: `tw${i}`,
      kind: "tower",
      map: t.map,
      x: t.x,
      y: t.y,
      found,
      known: true,
      name: t.name ?? null,
    });
  });

  const counts: PoiCounts = {
    fastTravel: {
      found: hasFtGuids
        ? ftFound
        : Math.min(unlockedFt.size, data.fast_travel.length),
      total: data.fast_travel.length,
    },
    effigies: {
      found: hasEffGuids
        ? effFound
        : Math.min(foundEff.size, data.effigies.length),
      total: data.effigies.length,
    },
    effigyTypes: [...effigyTypeCounts.values()].sort((a, b) =>
      a.label.localeCompare(b.label),
    ),
    towers: {
      found: hasTowerKeys
        ? towerFound
        : Math.min(conqueredTowers.size, towers.length),
      total: hasTowerKeys ? keyedTowers : towers.length,
      joined: hasTowerKeys,
    },
    bounties: bounties.length,
    alphas: data.bosses.length,
    joined,
  };

  return { pins, counts };
}
