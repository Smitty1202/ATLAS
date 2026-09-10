// Shared, cached loader for `public/map/map-data.json` (contract C1). The file
// is ~6 MB (63k spawn points), so it is fetched at most once per session and
// the promise is memoized — both the World Map view and the Pal-dex "show on
// map" gate consume the same load without a second round-trip, and the dex
// never blocks its render on it (the gate resolves asynchronously).

import type { BossEntry, MapData, PoiPoint } from "./map-coords";

let mapDataPromise: Promise<MapData> | null = null;

interface ModernEffigyManifest {
  game_build: string;
  total: number;
  chunks: string[];
}

interface FieldBossKeyPoint {
  species: string;
  key: string;
  x: number;
  y: number;
  level: number;
}

interface FieldBossKeyManifest {
  game_build: string;
  total: number;
  bosses: FieldBossKeyPoint[];
}

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return r.json() as Promise<T>;
}

async function loadModernEffigies(): Promise<PoiPoint[]> {
  const manifest = await fetchJson<ModernEffigyManifest>(
    "/map/effigies-modern/manifest.json",
  );
  const chunks = await Promise.all(
    manifest.chunks.map((url) => fetchJson<PoiPoint[]>(url)),
  );
  const points = chunks.flat();
  if (points.length !== manifest.total) {
    throw new Error(
      `modern effigy data incomplete: expected ${manifest.total}, got ${points.length}`,
    );
  }
  return points;
}

async function loadFieldBossKeys(): Promise<FieldBossKeyPoint[]> {
  try {
    const manifest = await fetchJson<FieldBossKeyManifest>(
      "/map/field-boss-keys.json",
    );
    if (manifest.bosses.length !== manifest.total) {
      console.warn(
        `field-boss key data incomplete: expected ${manifest.total}, got ${manifest.bosses.length}`,
      );
    }
    return manifest.bosses;
  } catch (e) {
    // Optional compatibility sidecar. Older installs simply use the conservative
    // save-flag fallback in pins.ts until the current-game snapshot is generated.
    console.warn("field-boss key snapshot unavailable", e);
    return [];
  }
}

function mergeEffigies(data: MapData, modern: PoiPoint[]): MapData {
  const effigies = [...data.effigies];
  const seen = new Set(
    effigies
      .map((p) => p.guid)
      .filter((guid): guid is string => typeof guid === "string"),
  );

  for (const point of modern) {
    if (point.guid && seen.has(point.guid)) continue;
    effigies.push(point);
    if (point.guid) seen.add(point.guid);
  }

  return { ...data, effigies };
}

function mergeFieldBossKeys(data: MapData, keys: FieldBossKeyPoint[]): MapData {
  if (keys.length === 0) return data;

  const bySpeciesLevel = new Map<string, FieldBossKeyPoint[]>();
  for (const record of keys) {
    const indexKey = `${record.species.toLowerCase()}\u0000${record.level}`;
    const list = bySpeciesLevel.get(indexKey) ?? [];
    list.push(record);
    bySpeciesLevel.set(indexKey, list);
  }

  let matched = 0;
  const bosses: BossEntry[] = data.bosses.map((boss) => {
    if (boss.key) return boss;
    const indexKey = `${boss.species.toLowerCase()}\u0000${boss.level}`;
    const candidates = bySpeciesLevel.get(indexKey) ?? [];
    let best: FieldBossKeyPoint | null = null;
    let bestSq = Infinity;
    for (const candidate of candidates) {
      const dx = candidate.x - boss.x;
      const dy = candidate.y - boss.y;
      const sq = dx * dx + dy * dy;
      if (sq < bestSq) {
        bestSq = sq;
        best = candidate;
      }
    }
    // Both snapshots originate from DT_BossSpawnerLoactionData. The small
    // tolerance only absorbs JSON rounding; it must never become a radius join.
    if (!best || bestSq > 4) return boss;
    matched++;
    return { ...boss, key: best.key };
  });

  if (matched !== data.bosses.length) {
    console.warn(
      `field-boss key join matched ${matched}/${data.bosses.length} map bosses`,
    );
  }
  return { ...data, bosses };
}

/** Fetch (and cache) the whole map manifest plus generated static sidecars.
 * Callers degrade gracefully (no pins / no cross-link) when core loading fails. */
export function loadMapData(): Promise<MapData> {
  if (!mapDataPromise) {
    mapDataPromise = Promise.all([
      fetchJson<MapData>("/map/map-data.json"),
      loadModernEffigies(),
      loadFieldBossKeys(),
    ])
      .then(([data, modern, bossKeys]) =>
        mergeFieldBossKeys(mergeEffigies(data, modern), bossKeys),
      )
      .catch((e) => {
        // Reset so a later mount can retry a transient failure.
        mapDataPromise = null;
        throw e;
      });
  }
  return mapDataPromise;
}

/** Strip the case-insensitive `BOSS_` prefix from a field-boss species key so it
 * joins the pal-icon filename and the pal-dex species id (`BOSS_Alpaca` ->
 * `Alpaca`, `Boss_Anubis` -> `Anubis`). */
export function baseSpeciesId(species: string): string {
  return species.replace(/^boss_/i, "");
}

/** True when a spawn entry's `species` key is a field-boss (`BOSS_<id>`) rather
 * than a wild spawn. Field-boss locations are the Field Boss pin layer's
 * concern, so the wild-spawn heat overlay, its search combobox, and the dex
 * "show on map" gate all exclude them. */
export function isFieldBossSpawn(species: string): boolean {
  return /^boss_/i.test(species);
}

/** True when `data` has at least one WILD spawn point for the internal species
 * `id` (the dex/pal-icon id). Field-boss-only species (`BOSS_<id>` with no wild
 * entry) return false — they have no wild heat to render. */
export function speciesHasSpawns(data: MapData, id: string): boolean {
  return data.spawns.some(
    (s) => !isFieldBossSpawn(s.species) && baseSpeciesId(s.species) === id,
  );
}
