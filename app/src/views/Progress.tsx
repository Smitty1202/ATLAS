import { useEffect, useMemo, useState, type ReactNode } from "react";
import { loadMapData } from "../lib/map-data";
import type { MapData } from "../lib/map-coords";
import type { SpeciesEntry } from "../lib/types";
import { invoke } from "../lib/tauri";
import { useMapStateRefresh } from "../lib/use-map-state";
import { useAppState, type MapFocusTarget } from "../state";
import {
  buildMissingWorldObjectives,
  buildPalCollectionProgress,
  buildProgressStats,
  type JoinedRatioStat,
  type MissingWorldObjective,
  type MissingWorldObjectiveCategory,
  type MissingWorldObjectiveCategoryKey,
  type MissingWorldObjectivesProgress,
  type PalCollectionBucket,
  type PalCollectionItem,
  type PalCollectionProgress,
  type RatioStat,
} from "./progress/stats";

function scopeLabel(playerScope: string, players: { uid: string; name: string }[]): string {
  if (playerScope === "all") return "All players";
  const player = players.find((p) => p.uid === playerScope);
  return player?.name || playerScope.slice(0, 8);
}

function RatioValue({ stat }: { stat: RatioStat }) {
  return (
    <span className="font-mono text-[30px] font-semibold leading-none tracking-normal text-ink tabular-nums">
      <span className="text-amber">{stat.found}</span>
      <span className="mx-1.5 text-base text-ink-faint">/</span>
      <span>{stat.total}</span>
    </span>
  );
}

function StatCard({
  label,
  children,
  sub,
  title,
  muted = false,
}: {
  label: string;
  children: ReactNode;
  sub?: string;
  title?: string;
  muted?: boolean;
}) {
  return (
    <div
      title={title}
      className={`min-h-28 rounded-md border bg-panel p-4 ${
        muted ? "border-line-soft" : "border-line"
      }`}
    >
      <div className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
        {label}
      </div>
      <div className="mt-3">{children}</div>
      {sub && (
        <div className={`mt-2 text-[12px] ${muted ? "text-ink-faint" : "text-ink-dim"}`}>
          {sub}
        </div>
      )}
    </div>
  );
}

function MetaCard({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="rounded-md border border-line bg-raised/45 px-4 py-3">
      <div className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
        {label}
      </div>
      <div className="mt-1 min-w-0 text-[18px] font-semibold leading-tight text-ink">
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[12px] text-ink-faint">{sub}</div>}
    </div>
  );
}

function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-md border border-line bg-panel/60">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-amber" />
      <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-ink-faint">
        {label}
      </span>
    </div>
  );
}

function ErrorBlock({ title, error }: { title: string; error: string }) {
  return (
    <div className="rounded-md border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-bad">
      <div className="font-semibold">{title}</div>
      <div className="mt-1 break-words text-[12px] text-bad/90">{error}</div>
    </div>
  );
}

function progressSub(stat: JoinedRatioStat, complete: string): string {
  if (stat.joined) return complete;
  return stat.found > 0 ? "Partial tracking" : "Awaiting map keys";
}

const COLLECTION_BUCKETS: {
  key: PalCollectionBucket;
  label: string;
  sub: string;
}[] = [
  { key: "captured", label: "Captured", sub: "Lifetime captures" },
  {
    key: "discovered",
    label: "Discovered, not captured",
    sub: "Seen only",
  },
  { key: "undiscovered", label: "Undiscovered", sub: "Not seen" },
];

const OBJECTIVE_CATEGORIES: MissingWorldObjectiveCategoryKey[] = [
  "fastTravel",
  "effigies",
  "fieldBosses",
  "wantedFugitives",
  "towerRegions",
];

function emptyObjectiveState<T>(value: T): Record<MissingWorldObjectiveCategoryKey, T> {
  return OBJECTIVE_CATEGORIES.reduce(
    (out, key) => ({ ...out, [key]: value }),
    {} as Record<MissingWorldObjectiveCategoryKey, T>,
  );
}

function dexNo(item: PalCollectionItem): string {
  return Number.isFinite(item.paldexNo)
    ? `#${String(item.paldexNo).padStart(3, "0")}`
    : "#---";
}

function formatCount(count: number): string {
  return count.toLocaleString();
}

function filteredSpecies(
  items: PalCollectionItem[],
  query: string,
): PalCollectionItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(
    (item) =>
      item.name.toLowerCase().includes(q) ||
      String(item.paldexNo).includes(q) ||
      dexNo(item).toLowerCase().includes(q),
  );
}

function layerLabel(layer: string): string {
  if (layer === "MainMap") return "Palpagos";
  if (layer === "Tree") return "World Tree";
  return layer;
}

function objectiveStatus(category: MissingWorldObjectiveCategory): string {
  if (category.total === 0) return "Unavailable";
  if (!category.joined) return "Partial tracking";
  if (category.missing.length === 0) return "Complete";
  return `${category.missing.length} missing`;
}

function objectiveMatches(item: MissingWorldObjective, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    item.name,
    item.typeLabel,
    item.detail,
    item.layer,
    layerLabel(item.layer),
    item.level != null ? `lv ${item.level}` : "",
    item.level != null ? String(item.level) : "",
  ].some((part) => part.toLowerCase().includes(q));
}

function filteredObjectives(
  items: MissingWorldObjective[],
  query: string,
): MissingWorldObjective[] {
  return items.filter((item) => objectiveMatches(item, query));
}

function mapFocusTarget(item: MissingWorldObjective): MapFocusTarget {
  return {
    id: item.id,
    layer: item.layer,
    x: item.x,
    y: item.y,
    filter: item.focusFilter,
  };
}

function MissingObjectivesList({
  objectives,
  queries,
  openCategories,
  onQuery,
  onToggle,
  onOpenObjective,
}: {
  objectives: MissingWorldObjectivesProgress;
  queries: Record<MissingWorldObjectiveCategoryKey, string>;
  openCategories: Record<MissingWorldObjectiveCategoryKey, boolean>;
  onQuery: (key: MissingWorldObjectiveCategoryKey, query: string) => void;
  onToggle: (key: MissingWorldObjectiveCategoryKey, open: boolean) => void;
  onOpenObjective: (target: MapFocusTarget) => void;
}) {
  return (
    <div className="grid gap-3 xl:grid-cols-2">
      {objectives.categories.map((category) => {
        const query = queries[category.key] ?? "";
        const hasQuery = query.trim() !== "";
        const visible = filteredObjectives(category.missing, query);
        const open = hasQuery || openCategories[category.key];
        const status = objectiveStatus(category);
        return (
          <details
            key={category.key}
            open={open}
            onToggle={(e) => {
              if (!hasQuery) onToggle(category.key, e.currentTarget.open);
            }}
            className="overflow-hidden rounded-md border border-line bg-panel"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border-b border-line bg-raised/45 px-3 py-2.5 marker:hidden">
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold text-ink">
                  {category.label}
                </span>
                <span className="block truncate font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                  {status}
                </span>
              </span>
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-faint">
                <span className="text-amber">{category.found}</span>
                <span> / {category.total}</span>
              </span>
            </summary>

            <div className="space-y-2 p-3">
              <label className="flex min-w-0 flex-col gap-1">
                <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                  Search
                </span>
                <input
                  value={query}
                  onChange={(e) => onQuery(category.key, e.currentTarget.value)}
                  placeholder="Name, type, or level"
                  disabled={!category.joined || category.missing.length === 0}
                  className="rounded-md border border-line bg-abyss px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint focus:border-amber/60 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>

              {!category.joined ? (
                <div className="rounded-md border border-line-soft bg-abyss/40 px-3 py-5 text-center text-[13px] text-ink-faint">
                  Tracking partial/unavailable.
                </div>
              ) : category.missing.length === 0 ? (
                <div className="rounded-md border border-line-soft bg-abyss/40 px-3 py-5 text-center text-[13px] text-ink-faint">
                  Nothing unresolved.
                </div>
              ) : visible.length > 0 ? (
                <ul className="grid max-h-80 gap-1 overflow-y-auto">
                  {visible.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => onOpenObjective(mapFocusTarget(item))}
                        className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-hover focus:bg-hover"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-ink">
                            {item.name}
                          </span>
                          <span className="block truncate font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                            {item.typeLabel}
                            {item.detail ? ` · ${item.detail}` : ""}
                          </span>
                        </span>
                        <span className="shrink-0 text-right font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                          {layerLabel(item.layer)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="rounded-md border border-line-soft bg-abyss/40 px-3 py-5 text-center text-[13px] text-ink-faint">
                  No matches.
                </div>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}

function CaptureStatsPanel({
  collection,
  onOpenSpecies,
}: {
  collection: PalCollectionProgress;
  onOpenSpecies: (speciesId: string) => void;
}) {
  const mostCaptured = collection.captureStats.mostCaptured;
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(13rem,17rem)_1fr]">
      <div className="rounded-md border border-line bg-raised/45 px-3 py-3">
        <div className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
          Lifetime Captures
        </div>
        <div className="mt-2 font-mono text-[30px] font-semibold leading-none tabular-nums text-amber">
          {formatCount(collection.captureStats.totalCaptures)}
        </div>
        <div className="mt-2 text-[12px] text-ink-faint">Total captured Pals</div>
      </div>

      <div className="rounded-md border border-line bg-panel px-3 py-3">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <div className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
            Most Captured
          </div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
            Top 10
          </div>
        </div>
        {mostCaptured.length > 0 ? (
          <ol className="grid gap-1 md:grid-cols-2">
            {mostCaptured.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => onOpenSpecies(item.id)}
                  className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-hover focus:bg-hover"
                >
                  <span className="w-12 shrink-0 font-mono text-[11px] tabular-nums text-ink-faint">
                    {dexNo(item)}
                  </span>
                  <span className="min-w-0 truncate text-[13px] font-medium text-ink">
                    {item.name}
                  </span>
                  <span className="ml-auto shrink-0 font-mono text-[12px] font-semibold tabular-nums text-amber">
                    {formatCount(item.captureCount)}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <div className="px-2.5 py-6 text-center text-[13px] text-ink-faint">
            No captures recorded.
          </div>
        )}
      </div>
    </div>
  );
}

function CollectionList({
  collection,
  query,
  openBuckets,
  onQuery,
  onToggle,
  onOpenSpecies,
}: {
  collection: PalCollectionProgress;
  query: string;
  openBuckets: Record<PalCollectionBucket, boolean>;
  onQuery: (query: string) => void;
  onToggle: (bucket: PalCollectionBucket, open: boolean) => void;
  onOpenSpecies: (speciesId: string) => void;
}) {
  const hasQuery = query.trim() !== "";
  return (
    <div className="space-y-3">
      <CaptureStatsPanel collection={collection} onOpenSpecies={onOpenSpecies} />

      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="grid gap-2 sm:grid-cols-3">
          {COLLECTION_BUCKETS.map((bucket) => (
            <div
              key={bucket.key}
              className="rounded-md border border-line bg-raised/45 px-3 py-2"
            >
              <div className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                {bucket.label}
              </div>
              <div className="mt-1 font-mono text-[20px] font-semibold tabular-nums text-ink">
                {collection[bucket.key].length}
                <span className="ml-1.5 text-[12px] font-normal text-ink-faint">
                  / {collection.total}
                </span>
              </div>
            </div>
          ))}
        </div>
        <label className="flex min-w-0 flex-col gap-1 md:w-72">
          <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
            Search species
          </span>
          <input
            value={query}
            onChange={(e) => onQuery(e.currentTarget.value)}
            placeholder="Name or dex #"
            className="rounded-md border border-line bg-abyss px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint focus:border-amber/60"
          />
        </label>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        {COLLECTION_BUCKETS.map((bucket) => {
          const items = collection[bucket.key];
          const visible = filteredSpecies(items, query);
          const open = hasQuery || openBuckets[bucket.key];
          return (
            <details
              key={bucket.key}
              open={open}
              onToggle={(e) => {
                if (!hasQuery) onToggle(bucket.key, e.currentTarget.open);
              }}
              className="overflow-hidden rounded-md border border-line bg-panel"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border-b border-line bg-raised/45 px-3 py-2.5 marker:hidden">
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-ink">
                    {bucket.label}
                  </span>
                  <span className="block truncate font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                    {bucket.sub}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-faint">
                  <span className="text-amber">{visible.length}</span>
                  {hasQuery && visible.length !== items.length ? ` / ${items.length}` : ""}
                </span>
              </summary>
              <div className="max-h-80 overflow-y-auto p-2">
                {visible.length > 0 ? (
                  <ul className="grid gap-1">
                    {visible.map((item) => (
                      <li key={item.id}>
                        <button
                          onClick={() => onOpenSpecies(item.id)}
                          className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-hover focus:bg-hover"
                        >
                          <span className="w-12 shrink-0 font-mono text-[11px] tabular-nums text-ink-faint">
                            {dexNo(item)}
                          </span>
                          <span className="min-w-0 truncate text-[13px] font-medium text-ink">
                            {item.name}
                          </span>
                          {bucket.key === "captured" && (
                            <span className="ml-auto shrink-0 font-mono text-[11px] font-semibold tabular-nums text-amber">
                              {formatCount(item.captureCount)}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="px-2.5 py-6 text-center text-[13px] text-ink-faint">
                    No matches.
                  </div>
                )}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}

export default function Progress() {
  const {
    saveDir,
    saveSummary,
    saveLoading,
    saveError,
    playerScope,
    requestDex,
    requestMapFocus,
  } = useAppState();
  const { mapState, mapStateLoading, mapStateError } = useMapStateRefresh(saveDir);
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [mapDataLoading, setMapDataLoading] = useState(true);
  const [mapDataError, setMapDataError] = useState<string | null>(null);
  const [species, setSpecies] = useState<SpeciesEntry[]>([]);
  const [speciesLoading, setSpeciesLoading] = useState(true);
  const [speciesError, setSpeciesError] = useState<string | null>(null);
  const [collectionQuery, setCollectionQuery] = useState("");
  const [objectiveQueries, setObjectiveQueries] = useState<
    Record<MissingWorldObjectiveCategoryKey, string>
  >(() => emptyObjectiveState(""));
  const [openObjectiveCategories, setOpenObjectiveCategories] = useState<
    Record<MissingWorldObjectiveCategoryKey, boolean>
  >(() => ({
    ...emptyObjectiveState(false),
    fastTravel: true,
    fieldBosses: true,
    wantedFugitives: true,
    towerRegions: true,
  }));
  const [openBuckets, setOpenBuckets] = useState<
    Record<PalCollectionBucket, boolean>
  >({
    captured: true,
    discovered: true,
    undiscovered: false,
  });

  useEffect(() => {
    let alive = true;
    setMapDataLoading(true);
    loadMapData()
      .then((data) => {
        if (!alive) return;
        setMapData(data);
        setMapDataError(null);
      })
      .catch((e) => {
        if (!alive) return;
        setMapData(null);
        setMapDataError(String(e));
      })
      .finally(() => {
        if (alive) setMapDataLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    setSpeciesLoading(true);
    invoke<SpeciesEntry[]>("paldex_species")
      .then((rows) => {
        if (!alive) return;
        setSpecies(rows);
        setSpeciesError(null);
      })
      .catch((e) => {
        if (!alive) return;
        setSpecies([]);
        setSpeciesError(String(e));
      })
      .finally(() => {
        if (alive) setSpeciesLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const stats = useMemo(() => {
    if (!saveSummary || !mapData || !mapState || species.length === 0) {
      return null;
    }
    return buildProgressStats(saveSummary, species, mapData, mapState, playerScope);
  }, [saveSummary, species, mapData, mapState, playerScope]);

  const collection = useMemo(() => {
    if (!saveSummary || speciesLoading || speciesError) return null;
    return buildPalCollectionProgress(saveSummary, species, playerScope);
  }, [saveSummary, species, speciesLoading, speciesError, playerScope]);

  const missingObjectives = useMemo(() => {
    if (!mapData || !mapState || speciesLoading || speciesError) return null;
    return buildMissingWorldObjectives(mapData, mapState, playerScope, species);
  }, [mapData, mapState, playerScope, species, speciesLoading, speciesError]);

  const scopedName = scopeLabel(playerScope, saveSummary?.players ?? []);
  const loadingProgress =
    saveSummary !== null &&
    (speciesLoading || mapDataLoading || mapStateLoading) &&
    !stats;
  const loadingObjectives =
    saveSummary !== null &&
    (speciesLoading || mapDataLoading || mapStateLoading) &&
    !missingObjectives;
  const progressError =
    speciesError ??
    mapDataError ??
    (mapStateError && !mapState ? mapStateError : null);

  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 border-b border-line bg-panel/60 px-6 pb-4 pt-5">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-amber">
              Progress
            </div>
            <h1 className="font-display text-xl font-bold tracking-wide text-ink">
              World progress
            </h1>
          </div>
          {saveSummary && (
            <div className="text-right font-mono text-xs text-ink-dim">
              <span className="text-ink">{saveSummary.world_name}</span>
              <span className="mx-2 text-ink-faint">/</span>
              <span className="text-amber">{scopedName}</span>
            </div>
          )}
        </div>
      </header>

      {saveError && !saveSummary && (
        <div className="m-6">
          <ErrorBlock title="Save failed to load" error={saveError} />
        </div>
      )}

      {saveSummary ? (
        <main className="flex-1 overflow-auto px-6 py-5">
          <div className="grid gap-3 lg:grid-cols-4 xl:grid-cols-5">
            <MetaCard
              label="World"
              value={
                <span className="block truncate" title={saveSummary.world_name}>
                  {saveSummary.world_name}
                </span>
              }
            />
            <MetaCard label="Scope" value={scopedName} />
            <MetaCard
              label="Players"
              value={
                <span className="font-mono tabular-nums">
                  {stats?.playerCount ?? saveSummary.players.length}
                </span>
              }
            />
            <MetaCard
              label="Bases"
              value={
                <span className="font-mono tabular-nums">
                  {stats?.baseCount ?? "-"}
                </span>
              }
            />
            <MetaCard
              label="Owned Pals"
              value={
                <span className="font-mono tabular-nums">
                  {stats?.ownedPalCount ?? "-"}
                </span>
              }
            />
          </div>

          <section className="mt-5">
            <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.22em] text-ink-faint">
              Completion
            </div>

            {progressError ? (
              <ErrorBlock title="Progress data unavailable" error={progressError} />
            ) : loadingProgress ? (
              <LoadingBlock label="Loading progress" />
            ) : stats ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <StatCard label="Captured Pal Species" sub="Captured species">
                  <RatioValue stat={stats.capturedSpecies} />
                </StatCard>
                <StatCard label="Effigies" sub="Found">
                  <RatioValue stat={stats.effigies} />
                </StatCard>
                <StatCard label="Fast Travel" sub="Unlocked">
                  <RatioValue stat={stats.fastTravel} />
                </StatCard>
                <StatCard
                  label="Field Bosses"
                  sub={progressSub(stats.fieldBosses, "Defeated")}
                  muted={!stats.fieldBosses.joined}
                  title={
                    stats.fieldBosses.joined
                      ? "Defeated / total"
                      : "Some field-boss keys are unavailable in map data."
                  }
                >
                  <RatioValue stat={stats.fieldBosses} />
                </StatCard>
                <StatCard
                  label="Wanted Fugitives"
                  sub={progressSub(stats.wantedFugitives, "Defeated")}
                  muted={!stats.wantedFugitives.joined}
                  title={
                    stats.wantedFugitives.joined
                      ? "Defeated / total"
                      : "Some wanted-fugitive keys are unavailable in map data."
                  }
                >
                  <RatioValue stat={stats.wantedFugitives} />
                </StatCard>
                <StatCard
                  label="Tower Regions"
                  sub={progressSub(stats.towerRegions, "Reached")}
                  muted={!stats.towerRegions.joined}
                  title={
                    stats.towerRegions.joined
                      ? "Reached / tracked tower regions"
                      : "Tower-region keys are unavailable in map data."
                  }
                >
                  <RatioValue stat={stats.towerRegions} />
                </StatCard>
              </div>
            ) : (
              <LoadingBlock label="Loading progress" />
            )}
          </section>

          <section className="mt-6">
            <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.22em] text-ink-faint">
              Missing World Objectives
            </div>
            {progressError ? (
              <ErrorBlock
                title="Missing objectives unavailable"
                error={progressError}
              />
            ) : loadingObjectives ? (
              <LoadingBlock label="Loading objectives" />
            ) : missingObjectives ? (
              <MissingObjectivesList
                objectives={missingObjectives}
                queries={objectiveQueries}
                openCategories={openObjectiveCategories}
                onQuery={(key, query) =>
                  setObjectiveQueries((prev) => ({ ...prev, [key]: query }))
                }
                onToggle={(key, open) =>
                  setOpenObjectiveCategories((prev) => ({
                    ...prev,
                    [key]: open,
                  }))
                }
                onOpenObjective={requestMapFocus}
              />
            ) : (
              <LoadingBlock label="Loading objectives" />
            )}
          </section>

          <section className="mt-6">
            <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.22em] text-ink-faint">
              Pal Collection
            </div>
            {speciesError ? (
              <ErrorBlock title="Pal collection unavailable" error={speciesError} />
            ) : speciesLoading && !collection ? (
              <LoadingBlock label="Loading collection" />
            ) : collection ? (
              <CollectionList
                collection={collection}
                query={collectionQuery}
                openBuckets={openBuckets}
                onQuery={setCollectionQuery}
                onToggle={(bucket, open) =>
                  setOpenBuckets((prev) => ({ ...prev, [bucket]: open }))
                }
                onOpenSpecies={requestDex}
              />
            ) : (
              <LoadingBlock label="Loading collection" />
            )}
          </section>
        </main>
      ) : saveLoading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-ink-faint">
          Loading save&hellip;
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <div className="font-display text-lg text-ink-dim">No save loaded</div>
          <p className="max-w-xs text-sm text-ink-faint">
            Load a Palworld save from the sidebar to review this world's progress.
          </p>
        </div>
      )}
    </div>
  );
}
