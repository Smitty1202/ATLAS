$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

function Replace-Required([string]$Path, [string]$Old, [string]$New) {
    $text = Get-Content $Path -Raw
    if (-not $text.Contains($Old)) {
        throw "Required anchor not found in $Path`: $Old"
    }
    $text = $text.Replace($Old, $New)
    Set-Content $Path -Value $text -NoNewline -Encoding utf8
}

New-Item -ItemType Directory -Force "app/src/views/pal-intelligence" | Out-Null

@'
import { isAlpha, type ContainerKind, type OwnedPal, type SaveSummary } from "../../lib/types";
import { hexGuid } from "../../components/palbox/selectors";

export type IntelSortKey = "count" | "name" | "level" | "iv";
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

    const sortedInstances = [...instances].sort(
      (a, b) => ivAverage(b) - ivAverage(a) || b.level - a.level,
    );

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
'@ | Set-Content "app/src/views/pal-intelligence/selectors.ts" -NoNewline -Encoding utf8

@'
import { describe, expect, test } from "bun:test";
import type { OwnedPal, SaveSummary } from "../../lib/types";
import {
  applyIntelInstanceFilters,
  buildIntelGroups,
  filterIntelGroups,
  scopedIntelPals,
  sortIntelGroups,
} from "./selectors";

const A = Array.from({ length: 16 }, (_, i) => i + 1);
const B = Array.from({ length: 16 }, (_, i) => i + 21);
const C = Array.from({ length: 16 }, (_, i) => i + 41);
const BASE = Array.from({ length: 16 }, (_, i) => i + 61);

function hex(guid: number[]): string {
  return guid.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function pal(overrides: Partial<OwnedPal> = {}): OwnedPal {
  return {
    instance_id: A,
    character_id: "SheepBall",
    is_boss: false,
    is_lucky: false,
    is_human: false,
    gender: "Male",
    level: 12,
    rank: 0,
    passives: [],
    active_skills: [],
    ivs: { hp: 40, attack: 50, defense: 60 },
    nickname: null,
    owner_player_uid: A,
    container_id: null,
    slot_index: 0,
    container_kind: "Palbox",
    ...overrides,
  };
}

function summary(pals: OwnedPal[]): SaveSummary {
  return {
    world_name: "Test",
    players: [
      { uid: hex(A), name: "A", pal_capture_counts: [], paldeck_unlocked: [] },
      { uid: hex(B), name: "B", pal_capture_counts: [], paldeck_unlocked: [] },
    ],
    pals,
    bases: [
      {
        container_id: hex(BASE),
        guild_id: "guild",
        guild_name: "Guild",
        member_uids: [hex(A)],
      },
    ],
    warnings: [],
  };
}

describe("Pal Intelligence selectors", () => {
  test("scopes direct ownership plus guild base workers and excludes humans", () => {
    const rows = [
      pal({ instance_id: A, owner_player_uid: A }),
      pal({ instance_id: B, owner_player_uid: B }),
      pal({ instance_id: C, owner_player_uid: null, container_id: BASE, container_kind: "Base" }),
      pal({ instance_id: Array(16).fill(99), is_human: true, gender: null }),
    ];

    expect(scopedIntelPals(summary(rows), hex(A)).map((p) => p.instance_id)).toEqual([A, C]);
    expect(scopedIntelPals(summary(rows), "all")).toHaveLength(3);
  });

  test("builds lossless species aggregates", () => {
    const rows = [
      pal({ instance_id: A, passives: ["Artisan"], ivs: { hp: 10, attack: 40, defense: 90 } }),
      pal({
        instance_id: B,
        gender: "Female",
        level: 50,
        rank: 3,
        is_lucky: true,
        passives: ["Artisan", "Legend"],
        ivs: { hp: 100, attack: 80, defense: 70 },
        container_kind: "Party",
      }),
    ];

    const [group] = buildIntelGroups(rows, new Map([["SheepBall", "Lamball"]]));
    expect(group.name).toBe("Lamball");
    expect(group.count).toBe(2);
    expect(group.alpha_count).toBe(1);
    expect(group.lucky_count).toBe(1);
    expect(group.male_count).toBe(1);
    expect(group.female_count).toBe(1);
    expect(group.level_max).toBe(50);
    expect(group.rank_max).toBe(3);
    expect(group.iv_ranges.hp).toEqual([10, 100]);
    expect(group.passives).toEqual([
      { id: "Artisan", count: 2 },
      { id: "Legend", count: 1 },
    ]);
    expect(group.instances).toHaveLength(2);
  });

  test("filters instances by location and special status", () => {
    const rows = [
      pal({ instance_id: A, container_kind: "Party", is_boss: true }),
      pal({ instance_id: B, container_kind: "Palbox", is_lucky: true }),
    ];

    expect(applyIntelInstanceFilters(rows, { location: "Party", special: "all" })).toHaveLength(1);
    expect(applyIntelInstanceFilters(rows, { location: "all", special: "alpha" })).toHaveLength(2);
    expect(applyIntelInstanceFilters(rows, { location: "all", special: "lucky" })[0]?.instance_id).toEqual(B);
  });

  test("searches species, nicknames, and passive display names", () => {
    const rows = [pal({ nickname: "Fluffy", passives: ["WorkSpeedUp3"] })];
    const groups = buildIntelGroups(rows, new Map([["SheepBall", "Lamball"]]));
    const passives = new Map([["WorkSpeedUp3", "Artisan"]]);

    expect(filterIntelGroups(groups, "lamb", passives)).toHaveLength(1);
    expect(filterIntelGroups(groups, "fluffy", passives)).toHaveLength(1);
    expect(filterIntelGroups(groups, "artisan", passives)).toHaveLength(1);
    expect(filterIntelGroups(groups, "jetragon", passives)).toHaveLength(0);
  });

  test("sorts species groups by duplicate count or strongest observed IV average", () => {
    const rows = [
      pal({ instance_id: A, character_id: "SheepBall", ivs: { hp: 20, attack: 20, defense: 20 } }),
      pal({ instance_id: B, character_id: "SheepBall" }),
      pal({ instance_id: C, character_id: "JetDragon", ivs: { hp: 100, attack: 100, defense: 100 } }),
    ];
    const groups = buildIntelGroups(
      rows,
      new Map([
        ["SheepBall", "Lamball"],
        ["JetDragon", "Jetragon"],
      ]),
    );

    expect(sortIntelGroups(groups, "count")[0]?.species_id).toBe("SheepBall");
    expect(sortIntelGroups(groups, "iv")[0]?.species_id).toBe("JetDragon");
    expect(sortIntelGroups(groups, "name").map((g) => g.name)).toEqual(["Jetragon", "Lamball"]);
  });
});
'@ | Set-Content "app/src/views/pal-intelligence/selectors.test.ts" -NoNewline -Encoding utf8

@'
import { useEffect, useMemo, useState } from "react";
import { useAppState } from "../state";
import { invoke } from "../lib/tauri";
import {
  isAlpha,
  type ContainerKind,
  type NamedEntry,
  type OwnedPal,
  type PassiveEntry,
} from "../lib/types";
import { containerLabel, genderView, ivBand, QUALITY_TEXT } from "../lib/ui";
import { PalIcon, Tag } from "../components/primitives";
import { PassiveStrip } from "../components/passive-strip";
import { hexGuid } from "../components/palbox/selectors";
import {
  applyIntelInstanceFilters,
  buildIntelGroups,
  filterIntelGroups,
  scopedIntelPals,
  sortIntelGroups,
  type IntelLocationFilter,
  type IntelSortKey,
  type IntelSpecialFilter,
  type IntelSpeciesGroup,
} from "./pal-intelligence/selectors";

const LOCATION_OPTIONS: Array<[IntelLocationFilter, string]> = [
  ["all", "All locations"],
  ["Party", "Party"],
  ["Palbox", "Palbox"],
  ["Base", "Base"],
  ["ViewingCage", "Viewing cage"],
  ["GlobalPalStorage", "Global storage"],
  ["DimensionalPalStorage", "Dimensional storage"],
  ["Unknown", "Unknown"],
];

const SPECIAL_OPTIONS: Array<[IntelSpecialFilter, string]> = [
  ["all", "All Pals"],
  ["alpha", "Alpha / rare"],
  ["lucky", "Lucky / bred Alpha"],
  ["boss", "Field-boss origin"],
];

const SORT_OPTIONS: Array<[IntelSortKey, string]> = [
  ["count", "Most duplicates"],
  ["name", "Species name"],
  ["level", "Highest level"],
  ["iv", "Best IV average"],
];

function ivAverage(pal: OwnedPal): number {
  return Math.round((pal.ivs.hp + pal.ivs.attack + pal.ivs.defense) / 3);
}

function Range({ label, range }: { label: string; range: [number, number] }) {
  const topBand = ivBand(range[1]);
  return (
    <div className="rounded-md border border-line bg-raised/50 px-3 py-2">
      <div className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">{label}</div>
      <div className={`mt-1 font-mono text-sm font-semibold tabular-nums ${QUALITY_TEXT[topBand]}`}>
        {range[0] === range[1] ? range[0] : `${range[0]}–${range[1]}`}
      </div>
    </div>
  );
}

function SpeciesRow({
  group,
  selected,
  passiveNames,
  onSelect,
}: {
  group: IntelSpeciesGroup;
  selected: boolean;
  passiveNames: ReadonlyMap<string, string>;
  onSelect: () => void;
}) {
  const topPassives = group.passives.slice(0, 3);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full border-b border-line-soft px-4 py-3 text-left transition-colors ${
        selected ? "bg-hover" : "hover:bg-panel/70"
      }`}
    >
      <div className="flex items-center gap-3">
        <PalIcon id={group.species_id} name={group.name} size={42} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-ink">{group.name}</span>
            {group.alpha_count > 0 && <Tag tone="boss">{group.alpha_count} Alpha</Tag>}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] text-ink-faint">
            <span>{group.count} owned</span>
            <span>Lv {group.level_min === group.level_max ? group.level_max : `${group.level_min}–${group.level_max}`}</span>
            <span>best IV {group.best_iv_average}</span>
            {group.rank_max > 0 && <span className="text-amber">{"★".repeat(group.rank_max)}</span>}
          </div>
          {topPassives.length > 0 && (
            <div className="mt-1.5 flex min-w-0 gap-1 overflow-hidden">
              {topPassives.map((passive) => (
                <span
                  key={passive.id}
                  className="truncate rounded bg-raised px-1.5 py-0.5 text-[10px] text-ink-dim"
                  title={`${passiveNames.get(passive.id) ?? passive.id} × ${passive.count}`}
                >
                  {passiveNames.get(passive.id) ?? passive.id} ×{passive.count}
                </span>
              ))}
            </div>
          )}
        </div>
        <span className="font-display text-2xl font-bold tabular-nums text-amber">{group.count}</span>
      </div>
    </button>
  );
}

function InstanceRow({
  pal,
  playerName,
  onOpenDex,
}: {
  pal: OwnedPal;
  playerName: string;
  onOpenDex: () => void;
}) {
  const gender = genderView(pal.gender);
  const avg = ivAverage(pal);
  return (
    <div className="border-b border-line-soft px-4 py-3 last:border-b-0">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-ink">{pal.nickname ? `“${pal.nickname}”` : `Level ${pal.level}`}</span>
            <span className={gender.className} title={gender.label}>{gender.glyph}</span>
            {isAlpha(pal) && <Tag tone="boss">Alpha</Tag>}
            {pal.is_lucky && <Tag>Lucky</Tag>}
            {pal.is_boss && <Tag>Field boss</Tag>}
            {pal.rank > 0 && <span className="font-mono text-[11px] text-amber">{"★".repeat(pal.rank)}</span>}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-ink-faint">
            <span>Lv <span className="text-ink-dim">{pal.level}</span></span>
            <span>IV avg <span className={QUALITY_TEXT[ivBand(avg)]}>{avg}</span></span>
            <span>HP <span className={QUALITY_TEXT[ivBand(pal.ivs.hp)]}>{pal.ivs.hp}</span></span>
            <span>ATK <span className={QUALITY_TEXT[ivBand(pal.ivs.attack)]}>{pal.ivs.attack}</span></span>
            <span>DEF <span className={QUALITY_TEXT[ivBand(pal.ivs.defense)]}>{pal.ivs.defense}</span></span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Tag>{containerLabel(pal.container_kind)}</Tag>
            <span className="text-[11px] text-ink-faint">{playerName}</span>
          </div>
          {pal.passives.length > 0 && (
            <div className="mt-2 grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
              {pal.passives.map((passive, index) => (
                <PassiveStrip key={`${passive}-${index}`} id={passive} size="sm" />
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onOpenDex}
          className="shrink-0 rounded-md border border-line bg-raised px-2.5 py-1.5 text-[11px] font-medium text-ink-dim transition-colors hover:border-amber/40 hover:text-ink"
        >
          Pal-dex
        </button>
      </div>
    </div>
  );
}

export default function PalIntelligence() {
  const { saveSummary, saveLoading, saveError, playerScope, requestDex } = useAppState();
  const [speciesNames, setSpeciesNames] = useState<Map<string, string>>(new Map());
  const [passiveNames, setPassiveNames] = useState<Map<string, string>>(new Map());
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState<IntelLocationFilter>("all");
  const [special, setSpecial] = useState<IntelSpecialFilter>("all");
  const [sortKey, setSortKey] = useState<IntelSortKey>("count");
  const [selectedSpecies, setSelectedSpecies] = useState<string | null>(null);

  useEffect(() => {
    invoke<NamedEntry[]>("list_species")
      .then((rows) => setSpeciesNames(new Map(rows.map((row) => [row.id, row.name]))))
      .catch(() => {});
    invoke<PassiveEntry[]>("list_passives")
      .then((rows) => setPassiveNames(new Map(rows.map((row) => [row.id, row.name]))))
      .catch(() => {});
  }, []);

  const scoped = useMemo(
    () => (saveSummary ? scopedIntelPals(saveSummary, playerScope) : []),
    [saveSummary, playerScope],
  );

  const groups = useMemo(() => {
    const filteredInstances = applyIntelInstanceFilters(scoped, { location, special });
    const grouped = buildIntelGroups(filteredInstances, speciesNames);
    const searched = filterIntelGroups(grouped, search, passiveNames);
    return sortIntelGroups(searched, sortKey);
  }, [scoped, location, special, speciesNames, search, passiveNames, sortKey]);

  const visibleInstances = useMemo(
    () => groups.reduce((sum, group) => sum + group.count, 0),
    [groups],
  );

  useEffect(() => {
    if (groups.length === 0) {
      setSelectedSpecies(null);
      return;
    }
    if (!selectedSpecies || !groups.some((group) => group.species_id === selectedSpecies)) {
      setSelectedSpecies(groups[0].species_id);
    }
  }, [groups, selectedSpecies]);

  const selected = groups.find((group) => group.species_id === selectedSpecies) ?? null;

  const playerNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const player of saveSummary?.players ?? []) map.set(player.uid, player.name || player.uid.slice(0, 8));
    return map;
  }, [saveSummary]);

  function ownerLabel(pal: OwnedPal): string {
    if (pal.owner_player_uid) {
      const uid = hexGuid(pal.owner_player_uid);
      return playerNames.get(uid) ?? uid.slice(0, 8);
    }
    if (pal.container_kind === "Base") return "Guild base";
    return "Unassigned";
  }

  if (saveLoading && !saveSummary) {
    return <div className="flex h-full items-center justify-center text-sm text-ink-faint">Reading Pal population…</div>;
  }

  if (!saveSummary) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md rounded-lg border border-line bg-panel p-6 text-center">
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-amber">Pal Intelligence</div>
          <h1 className="mt-1 font-display text-xl font-bold text-ink">Load a save to inspect your Pal population</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-faint">ATLAS groups the real owned-Pal records from your save. Nothing is modified.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-abyss">
      <header className="shrink-0 border-b border-line px-6 py-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-amber">Pal Intelligence</div>
            <h1 className="mt-0.5 font-display text-xl font-bold tracking-wide text-ink">Owned Pal Inventory</h1>
            <p className="mt-1 text-[12px] text-ink-faint">Species-first inventory with every aggregate traceable to the exact save records.</p>
          </div>
          <div className="text-right font-mono text-[10px] uppercase tracking-wider text-ink-faint">
            <div><span className="text-amber">{groups.length}</span> species shown</div>
            <div><span className="text-ink-dim">{visibleInstances}</span> / {scoped.length} Pals</div>
          </div>
        </div>
      </header>

      <div className="grid shrink-0 grid-cols-[minmax(240px,1.5fr)_repeat(3,minmax(145px,0.6fr))] gap-2 border-b border-line bg-panel/40 px-6 py-3">
        <input
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          placeholder="Search species, nickname, or passive…"
          className="min-w-0 rounded-md border border-line bg-raised px-3 py-2 text-[13px] text-ink outline-none placeholder:text-ink-faint focus:border-amber/50"
        />
        <select value={location} onChange={(event) => setLocation(event.currentTarget.value as IntelLocationFilter)} className="rounded-md border border-line bg-raised px-2.5 py-2 text-[12px] text-ink-dim outline-none focus:border-amber/50">
          {LOCATION_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select value={special} onChange={(event) => setSpecial(event.currentTarget.value as IntelSpecialFilter)} className="rounded-md border border-line bg-raised px-2.5 py-2 text-[12px] text-ink-dim outline-none focus:border-amber/50">
          {SPECIAL_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select value={sortKey} onChange={(event) => setSortKey(event.currentTarget.value as IntelSortKey)} className="rounded-md border border-line bg-raised px-2.5 py-2 text-[12px] text-ink-dim outline-none focus:border-amber/50">
          {SORT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      {saveError && <div className="shrink-0 border-b border-bad/30 bg-bad/10 px-6 py-2 text-[11px] text-bad">{saveError}</div>}

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(330px,0.9fr)_minmax(0,1.55fr)]">
        <section className="min-h-0 overflow-y-auto border-r border-line">
          {groups.length === 0 ? (
            <div className="p-8 text-center text-sm text-ink-faint">No owned Pals match these filters.</div>
          ) : (
            groups.map((group) => (
              <SpeciesRow
                key={group.species_id}
                group={group}
                selected={group.species_id === selectedSpecies}
                passiveNames={passiveNames}
                onSelect={() => setSelectedSpecies(group.species_id)}
              />
            ))
          )}
        </section>

        <section className="min-h-0 overflow-y-auto">
          {selected ? (
            <>
              <div className="sticky top-0 z-10 border-b border-line bg-panel/95 px-5 py-4 backdrop-blur">
                <div className="flex items-center gap-4">
                  <PalIcon id={selected.species_id} name={selected.name} size={56} />
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-amber">{selected.count} owned</div>
                    <h2 className="truncate font-display text-xl font-bold text-ink">{selected.name}</h2>
                    <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-ink-faint">
                      <span>{selected.male_count} male</span>
                      <span>{selected.female_count} female</span>
                      {selected.unknown_gender_count > 0 && <span>{selected.unknown_gender_count} unknown</span>}
                      {selected.alpha_count > 0 && <span className="text-amber">{selected.alpha_count} Alpha</span>}
                    </div>
                  </div>
                  <button type="button" onClick={() => requestDex(selected.species_id)} className="rounded-md border border-line bg-raised px-3 py-2 text-[12px] font-medium text-ink-dim transition-colors hover:border-amber/40 hover:text-ink">Open species in Pal-dex</button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 border-b border-line px-5 py-4 xl:grid-cols-4">
                <Range label="HP IV range" range={selected.iv_ranges.hp} />
                <Range label="ATK IV range" range={selected.iv_ranges.attack} />
                <Range label="DEF IV range" range={selected.iv_ranges.defense} />
                <div className="rounded-md border border-line bg-raised/50 px-3 py-2">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">Best IV average</div>
                  <div className={`mt-1 font-mono text-sm font-semibold ${QUALITY_TEXT[ivBand(selected.best_iv_average)]}`}>{selected.best_iv_average}</div>
                </div>
              </div>

              <div className="grid gap-0 border-b border-line lg:grid-cols-2">
                <div className="border-b border-line px-5 py-4 lg:border-b-0 lg:border-r">
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">Passive distribution</div>
                  <div className="mt-2 flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
                    {selected.passives.length > 0 ? selected.passives.map((passive) => (
                      <span key={passive.id} className="rounded-md border border-line bg-raised px-2 py-1 text-[11px] text-ink-dim" title={passive.id}>
                        {passiveNames.get(passive.id) ?? passive.id} <span className="font-mono text-amber">×{passive.count}</span>
                      </span>
                    )) : <span className="text-[12px] text-ink-faint">No passives recorded.</span>}
                  </div>
                </div>
                <div className="px-5 py-4">
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">Location distribution</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selected.locations.map((row) => (
                      <span key={row.kind} className="rounded-md border border-line bg-raised px-2 py-1 text-[11px] text-ink-dim">
                        {containerLabel(row.kind as ContainerKind)} <span className="font-mono text-amber">×{row.count}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="border-b border-line bg-raised/30 px-5 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">Individual instances · strongest IV average first</div>
              <div>
                {selected.instances.map((pal) => (
                  <InstanceRow
                    key={hexGuid(pal.instance_id)}
                    pal={pal}
                    playerName={ownerLabel(pal)}
                    onOpenDex={() => requestDex(selected.species_id, hexGuid(pal.instance_id))}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-sm text-ink-faint">Choose a species to inspect its owned instances.</div>
          )}
        </section>
      </div>
    </div>
  );
}
'@ | Set-Content "app/src/views/PalIntelligence.tsx" -NoNewline -Encoding utf8

Replace-Required "app/src/state.tsx" `
'export type View = "save" | "progress" | "solver" | "paldex" | "ivlab" | "worldmap";' `
'export type View = "save" | "progress" | "intel" | "solver" | "paldex" | "ivlab" | "worldmap";'

Replace-Required "app/src/App.tsx" `
'import Progress from "./views/Progress";' `
'import Progress from "./views/Progress";`nimport PalIntelligence from "./views/PalIntelligence";'

Replace-Required "app/src/App.tsx" `
'  if (view === "ivlab")' `
'  if (view === "intel")`n    return (`n      <svg {...common}>`n        <path d="M8 5.5a3 3 0 0 1 4-2.8 3 3 0 0 1 4 2.8 3 3 0 0 1 2.4 4.7A3.4 3.4 0 0 1 17 16.5a3.2 3.2 0 0 1-5 2.6 3.2 3.2 0 0 1-5-2.6 3.4 3.4 0 0 1-1.4-6.3A3 3 0 0 1 8 5.5Z" />`n        <path d="M12 3v16M8.5 8.5H12M12 13.5h4" />`n      </svg>`n    );`n  if (view === "ivlab")'

Replace-Required "app/src/App.tsx" `
'  { id: "progress", label: "Progress", hint: "Dashboard" },' `
'  { id: "progress", label: "Progress", hint: "Dashboard" },`n  { id: "intel", label: "Pal Intelligence", hint: "Inventory" },'

Replace-Required "app/src/App.tsx" `
'            {view === "progress" && <Progress />}' `
'            {view === "progress" && <Progress />}`n            {view === "intel" && <PalIntelligence />}'

$changelog = Get-Content "CHANGELOG.md" -Raw
if (-not $changelog.Contains("## [0.5.0] - Unreleased")) {
    $anchor = "Notable changes per release, newest first. Dates are ship dates unless a`nversion is marked Unreleased.`n`n"
    if (-not $changelog.Contains($anchor)) { throw "CHANGELOG header anchor not found" }
    $entry = @'
## [0.5.0] - Unreleased

### Added
- Added the first Pal Intelligence inventory workspace: species-first grouping over the authoritative owned-Pal save records, with search, location/special filters, duplicate counts, passive/location distributions, IV ranges, Alpha/Lucky/field-boss indicators, ownership context, and instance-level Pal-dex drill-down.
- Added focused selector tests for player/guild-base scoping, human exclusion, aggregation, filtering, searching, and sorting.

'@
    $changelog = $changelog.Replace($anchor, $anchor + $entry)
    Set-Content "CHANGELOG.md" -Value $changelog -NoNewline -Encoding utf8
}

Write-Host "Pal Intelligence Slice 1 source changes generated."
