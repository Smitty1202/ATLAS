// The map filter popover: layer toggles, effigy-family filtering, and spoiler
// controls. MapView owns the main layer state; effigy type selection is a small
// shared persisted map preference.

import { useEffect, useState } from "react";
import type { LayerFilters } from "./PinLayer";
import type { PoiCounts } from "./pins";
import {
  EFFIGY_TYPES_EVENT,
  readEffigyTypeSelection,
  writeEffigyTypeSelection,
  type EffigyTypeSelection,
} from "./effigy-filter";

function Row({
  on,
  onToggle,
  label,
  count,
  countTitle,
  dimCount,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
  count?: string;
  countTitle?: string;
  dimCount?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      role="switch"
      aria-checked={on}
      className="flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left transition-colors hover:bg-hover"
    >
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border transition-colors ${
          on ? "border-amber bg-amber text-abyss" : "border-line bg-abyss"
        }`}
      >
        {on && (
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2.5 6.5l2.5 2.5 4.5-5.5" />
          </svg>
        )}
      </span>
      <span className={`flex-1 font-mono text-[12px] tracking-wide ${on ? "text-ink" : "text-ink-faint"}`}>
        {label}
      </span>
      {count && (
        <span
          title={countTitle}
          className={`font-mono text-[11px] tabular-nums ${dimCount ? "text-ink-faint italic" : "text-ink-dim"}`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function SmallToggle({
  on,
  onToggle,
  label,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      role="switch"
      aria-checked={on}
      className="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left transition-colors hover:bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-amber"
    >
      <span
        className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-colors ${
          on ? "border-amber bg-amber text-abyss" : "border-line bg-abyss"
        }`}
      >
        {on && (
          <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2.5 6.5l2.5 2.5 4.5-5.5" />
          </svg>
        )}
      </span>
      <span className={`flex-1 font-mono text-[11px] tracking-wide ${on ? "text-ink" : "text-ink-faint"}`}>
        {label}
      </span>
    </button>
  );
}

export default function FilterPanel({
  filters,
  setFilter,
  counts,
  hasBounties,
  spawnLabel,
  playerCount,
  markerCount,
  basesCount,
  fogOn,
  showHidden,
  setShowHidden,
}: {
  filters: LayerFilters;
  setFilter: (key: keyof LayerFilters, on: boolean) => void;
  counts: PoiCounts;
  hasBounties: boolean;
  spawnLabel: string | null;
  playerCount: number;
  markerCount: number;
  basesCount: number;
  fogOn: boolean;
  showHidden: boolean;
  setShowHidden: (on: boolean) => void;
}) {
  const ft = counts.fastTravel;
  const ef = counts.effigies;
  const tw = counts.towers;
  const effigyTypes = counts.effigyTypes ?? [];
  const hideUnfound = filters.hideUnfoundEffigies;
  const hideFound = filters.hideFoundEffigies ?? false;
  const effigyCount = hideFound
    ? `${Math.max(0, ef.total - ef.found)} remaining`
    : hideUnfound
      ? `${ef.found} found`
      : `${ef.found}/${ef.total}`;

  const [effigySelection, setEffigySelection] = useState<EffigyTypeSelection>(
    readEffigyTypeSelection,
  );
  const [effigyTypesOpen, setEffigyTypesOpen] = useState(false);

  useEffect(() => {
    const sync = () => setEffigySelection(readEffigyTypeSelection());
    window.addEventListener(EFFIGY_TYPES_EVENT, sync);
    return () => window.removeEventListener(EFFIGY_TYPES_EVENT, sync);
  }, []);

  const allEffigyKeys = effigyTypes.map((t) => t.key);
  const selectedCount =
    effigySelection === null
      ? allEffigyKeys.length
      : allEffigyKeys.filter((key) => effigySelection.includes(key)).length;
  const effigyTypeSummary =
    selectedCount === allEffigyKeys.length
      ? "All"
      : selectedCount === 0
        ? "None"
        : `${selectedCount}/${allEffigyKeys.length}`;

  const applyEffigySelection = (next: EffigyTypeSelection) => {
    setEffigySelection(next);
    writeEffigyTypeSelection(next);
  };

  const toggleEffigyType = (key: string) => {
    if (effigySelection === null) {
      applyEffigySelection(allEffigyKeys.filter((candidate) => candidate !== key));
      return;
    }
    const next = new Set(effigySelection);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    const normalized = allEffigyKeys.filter((candidate) => next.has(candidate));
    applyEffigySelection(
      normalized.length === allEffigyKeys.length ? null : normalized,
    );
  };

  const toggleHideFound = () => {
    const next = !hideFound;
    if (next && hideUnfound) setFilter("hideUnfoundEffigies", false);
    setFilter("hideFoundEffigies", next);
  };

  const toggleHideUnfound = () => {
    const next = !hideUnfound;
    if (next && hideFound) setFilter("hideFoundEffigies", false);
    setFilter("hideUnfoundEffigies", next);
  };

  return (
    <div className="absolute right-0 top-full z-20 mt-2 max-h-[70vh] w-72 overflow-y-auto rounded-md border border-line bg-panel/95 p-1.5 shadow-lg backdrop-blur">
      <div className="px-2 pb-1 pt-1 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-faint">
        Layers
      </div>
      <Row
        on={filters.fastTravel}
        onToggle={() => setFilter("fastTravel", !filters.fastTravel)}
        label="Fast Travel"
        count={`${ft.found}/${ft.total}`}
        countTitle={counts.joined ? "Unlocked / total" : "Unlocked (per-pin match unavailable)"}
        dimCount={!counts.joined}
      />
      <Row
        on={filters.alpha}
        onToggle={() => setFilter("alpha", !filters.alpha)}
        label="Alpha Pals"
        count={String(counts.alphas)}
      />
      <Row
        on={filters.effigies}
        onToggle={() => setFilter("effigies", !filters.effigies)}
        label="Effigies"
        count={effigyCount}
        countTitle={
          hideFound
            ? "Uncollected effigies shown"
            : hideUnfound
              ? "Collected effigies shown"
              : counts.joined
                ? "Collected / total"
                : "Collected (per-pin match unavailable)"
        }
        dimCount={!counts.joined && !hideUnfound && !hideFound}
      />

      {(filters.effigies || effigyTypes.length > 0) && (
        <div className="mb-0.5 ml-3 border-l border-line-soft pl-2">
          {filters.effigies && (
            <div className="py-0.5">
              <SmallToggle on={hideFound} onToggle={toggleHideFound} label="Hide found" />
              <SmallToggle on={hideUnfound} onToggle={toggleHideUnfound} label="Hide unfound" />
            </div>
          )}

          {effigyTypes.length > 0 && (
            <>
              <div className="flex items-center gap-1 border-t border-line-soft px-1 py-0.5">
                <button
                  type="button"
                  onClick={() => setEffigyTypesOpen((open) => !open)}
                  aria-expanded={effigyTypesOpen}
                  className="flex min-w-0 flex-1 items-center gap-1.5 rounded-sm px-1 py-1 text-left transition-colors hover:bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-amber"
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`shrink-0 text-ink-faint transition-transform ${effigyTypesOpen ? "rotate-90" : ""}`}
                  >
                    <path d="M4 2.5L8 6 4 9.5" />
                  </svg>
                  <span className="min-w-0 flex-1 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
                    Effigy types
                  </span>
                  <span className="font-mono text-[9px] tabular-nums text-ink-dim">
                    {effigyTypeSummary}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => applyEffigySelection(null)}
                  className="rounded-sm px-1 py-1 font-mono text-[9px] uppercase tracking-wider text-amber hover:bg-hover hover:text-amber-bright"
                  title="Show all effigy types"
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => applyEffigySelection([])}
                  className="rounded-sm px-1 py-1 font-mono text-[9px] uppercase tracking-wider text-ink-faint hover:bg-hover hover:text-ink"
                  title="Hide all effigy types"
                >
                  None
                </button>
              </div>

              {effigyTypesOpen && (
                <div className="border-t border-line-soft pt-1">
                  {effigyTypes.map((type) => {
                    const on = effigySelection === null || effigySelection.includes(type.key);
                    const count = hideFound
                      ? Math.max(0, type.total - type.found)
                      : hideUnfound
                        ? type.found
                        : null;
                    return (
                      <button
                        key={type.key}
                        type="button"
                        onClick={() => toggleEffigyType(type.key)}
                        role="switch"
                        aria-checked={on}
                        className="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left transition-colors hover:bg-hover"
                      >
                        <span
                          className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-colors ${
                            on ? "border-amber bg-amber text-abyss" : "border-line bg-abyss"
                          }`}
                        >
                          {on && (
                            <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M2.5 6.5l2.5 2.5 4.5-5.5" />
                            </svg>
                          )}
                        </span>
                        <span className={`flex-1 font-mono text-[10px] tracking-wide ${on ? "text-ink" : "text-ink-faint"}`}>
                          {type.label}
                        </span>
                        <span className="font-mono text-[9px] tabular-nums text-ink-faint">
                          {count == null ? `${type.found}/${type.total}` : String(count)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {hasBounties && (
        <Row
          on={filters.bounties}
          onToggle={() => setFilter("bounties", !filters.bounties)}
          label="Bounties"
          count={String(counts.bounties)}
        />
      )}
      {tw.total > 0 && (
        <Row
          on={filters.towers}
          onToggle={() => setFilter("towers", !filters.towers)}
          label="Towers"
          count={tw.joined ? `${tw.found}/${tw.total}` : String(tw.total)}
          countTitle={tw.joined ? "Reached / tracked towers" : "Syndicate towers"}
        />
      )}
      <Row
        on={filters.spawns}
        onToggle={() => setFilter("spawns", !filters.spawns)}
        label="Spawns"
        count={spawnLabel ?? "—"}
        countTitle={spawnLabel ? `Showing ${spawnLabel}` : "Search a species below"}
      />
      <Row
        on={filters.players}
        onToggle={() => setFilter("players", !filters.players)}
        label="Players"
        count={String(playerCount)}
      />
      <Row
        on={filters.markers}
        onToggle={() => setFilter("markers", !filters.markers)}
        label="Markers"
        count={String(markerCount)}
      />
      {basesCount > 0 && (
        <Row
          on={filters.bases}
          onToggle={() => setFilter("bases", !filters.bases)}
          label="Bases"
          count={String(basesCount)}
          countTitle="Your base camps"
        />
      )}

      {fogOn && (
        <div className="mt-1 border-t border-line-soft pt-1.5">
          <Row
            on={showHidden}
            onToggle={() => setShowHidden(!showHidden)}
            label="Show hidden"
          />
          <p className="px-2 pb-1 pt-0.5 font-mono text-[9px] leading-relaxed tracking-wide text-warn/80">
            {showHidden
              ? "Revealing pins in unexplored areas — spoilers."
              : "Pins under fog are hidden to avoid spoilers."}
          </p>
        </div>
      )}
    </div>
  );
}
