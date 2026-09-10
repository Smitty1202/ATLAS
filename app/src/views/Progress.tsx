import { useEffect, useMemo, useState, type ReactNode } from "react";
import { loadMapData } from "../lib/map-data";
import type { MapData } from "../lib/map-coords";
import type { SpeciesEntry } from "../lib/types";
import { invoke } from "../lib/tauri";
import { useMapStateRefresh } from "../lib/use-map-state";
import { useAppState } from "../state";
import {
  buildProgressStats,
  type JoinedRatioStat,
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

export default function Progress() {
  const { saveDir, saveSummary, saveLoading, saveError, playerScope } =
    useAppState();
  const { mapState, mapStateLoading, mapStateError } = useMapStateRefresh(saveDir);
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [mapDataLoading, setMapDataLoading] = useState(true);
  const [mapDataError, setMapDataError] = useState<string | null>(null);
  const [species, setSpecies] = useState<SpeciesEntry[]>([]);
  const [speciesLoading, setSpeciesLoading] = useState(true);
  const [speciesError, setSpeciesError] = useState<string | null>(null);

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

  const scopedName = scopeLabel(playerScope, saveSummary?.players ?? []);
  const loadingProgress =
    saveSummary !== null &&
    (speciesLoading || mapDataLoading || mapStateLoading) &&
    !stats;
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
