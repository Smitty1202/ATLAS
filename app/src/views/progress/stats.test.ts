import { expect, test } from "bun:test";
import type { MapData } from "../../lib/map-coords";
import type {
  Guid,
  MapPlayerState,
  MapState,
  OwnedPal,
  PlayerRef,
  SaveSummary,
  SpeciesEntry,
} from "../../lib/types";
import { buildPalCollectionProgress, buildProgressStats } from "./stats";

function guid(seed: number): Guid {
  return Array.from({ length: 16 }, (_, i) => (seed + i) & 0xff);
}

function pal(
  characterId: string,
  owner: Guid | null,
  overrides: Partial<OwnedPal> = {},
): OwnedPal {
  return {
    instance_id: guid(characterId.length),
    character_id: characterId,
    is_boss: false,
    is_lucky: false,
    is_human: false,
    gender: "Male",
    level: 1,
    rank: 0,
    passives: [],
    active_skills: [],
    ivs: { hp: 0, attack: 0, defense: 0 },
    nickname: null,
    owner_player_uid: owner,
    container_id: null,
    slot_index: null,
    container_kind: "Palbox",
    ...overrides,
  };
}

function player(uid: string, flags: Partial<MapPlayerState>): MapPlayerState {
  return {
    uid,
    nickname: null,
    x: null,
    y: null,
    fast_travel_unlocked: [],
    effigies_found: [],
    effigies_found_legacy: [],
    effigies_found_by_type: [],
    effigy_possess_num: 0,
    bosses_defeated: [],
    areas_found: [],
    towers_defeated: [],
    ...flags,
  };
}

function savePlayer(
  uid: string,
  name: string,
  captures: Record<string, number>,
  paldeckUnlocked = Object.keys(captures),
): PlayerRef {
  return {
    uid,
    name,
    pal_capture_counts: Object.entries(captures).map(([species_id, count]) => ({
      species_id,
      count,
    })),
    paldeck_unlocked: paldeckUnlocked,
  };
}

const species: SpeciesEntry[] = [
  { id: "SheepBall", name: "Lamball", paldex_no: 1 },
  { id: "PinkCat", name: "Cattiva", paldex_no: 2 },
  { id: "Penguin", name: "Pengullet", paldex_no: 10 },
] as SpeciesEntry[];

const mapData: MapData = {
  maps: {},
  spawns: [],
  fast_travel: [
    { x: 0, y: 0, map: "MainMap", name: "Plateau", guid: "FT_A" },
    { x: 1, y: 0, map: "MainMap", name: "Marsh", guid: "FT_B" },
  ],
  effigies: [
    { x: 0, y: 1, map: "MainMap", guid: "EF_A" },
    { x: 1, y: 1, map: "MainMap", guid: "EF_B" },
  ],
  bosses: [
    { x: 0, y: 2, map: "MainMap", species: "BOSS_SheepBall", level: 11, key: "Boss_A" },
  ],
  bounties: [
    { x: 0, y: 3, map: "MainMap", cid: "BOSS_Hunter" },
  ],
  towers: [
    { x: 0, y: 4, map: "MainMap", key: "Tower_Grass", name: "Rayne Tower" },
  ],
};

test("progress stats use lifetime captures for player scope while owned pals stay current", () => {
  const p1 = guid(1);
  const p2 = guid(33);
  const p1Hex = "0102030405060708090a0b0c0d0e0f10";
  const p2Hex = "2122232425262728292a2b2c2d2e2f30";
  const summary: SaveSummary = {
    world_name: "Mosslight",
    players: [
      savePlayer(p1Hex, "Ada", { SheepBall: 4, Penguin: 1, PinkCat: 0 }),
      savePlayer(p2Hex, "Bea", { PinkCat: 2 }),
    ],
    pals: [
      pal("SheepBall", p1),
      pal("Male_People03", p1, { is_human: true }),
      pal("PinkCat", p2),
      pal("Penguin", null),
    ],
    bases: [
      {
        container_id: "base-a",
        guild_id: "guild-a",
        guild_name: "Ada Base",
        member_uids: [p1Hex],
      },
      {
        container_id: "base-b",
        guild_id: "guild-b",
        guild_name: "Bea Base",
        member_uids: [p2Hex],
      },
    ],
    warnings: [],
  };
  const mapState: MapState = {
    fog: null,
    local_source: null,
    markers: [],
    players: [
      player(p1Hex, {
        fast_travel_unlocked: ["FT_A"],
        effigies_found: ["EF_A"],
        bosses_defeated: ["Boss_A"],
        towers_defeated: ["Tower_Grass"],
      }),
      player(p2Hex, {
        fast_travel_unlocked: ["FT_B"],
        effigies_found: ["EF_B"],
        bosses_defeated: ["BOSS_Hunter"],
      }),
    ],
  };

  const stats = buildProgressStats(summary, species, mapData, mapState, p1Hex);

  expect(stats.worldName).toBe("Mosslight");
  expect(stats.playerCount).toBe(2);
  expect(stats.baseCount).toBe(1);
  expect(stats.ownedPalCount).toBe(1);
  expect(stats.capturedSpecies).toEqual({ found: 2, total: 3 });
  expect(stats.fastTravel).toEqual({ found: 1, total: 2 });
  expect(stats.effigies).toEqual({ found: 1, total: 2 });
  expect(stats.fieldBosses).toEqual({ found: 1, total: 1, joined: true });
  expect(stats.wantedFugitives).toEqual({ found: 0, total: 1, joined: true });
  expect(stats.towerRegions).toEqual({ found: 1, total: 1, joined: true });
});

test("all-player progress unions lifetime captures and map flags", () => {
  const p1 = guid(1);
  const p2 = guid(33);
  const p1Hex = "0102030405060708090a0b0c0d0e0f10";
  const p2Hex = "2122232425262728292a2b2c2d2e2f30";
  const summary: SaveSummary = {
    world_name: "Mosslight",
    players: [
      savePlayer(p1Hex, "Ada", { SheepBall: 4, Penguin: 1 }),
      savePlayer(p2Hex, "Bea", { PinkCat: 2, SheepBall: 1 }),
    ],
    pals: [
      pal("SheepBall", p1),
      pal("PinkCat", p2),
      pal("Male_People03", p2, { is_human: true }),
    ],
    bases: [
      {
        container_id: "base-a",
        guild_id: "guild-a",
        guild_name: "Ada Base",
        member_uids: [p1Hex],
      },
      {
        container_id: "base-b",
        guild_id: "guild-b",
        guild_name: "Bea Base",
        member_uids: [p2Hex],
      },
    ],
    warnings: [],
  };
  const mapState: MapState = {
    fog: null,
    local_source: null,
    markers: [],
    players: [
      player(p1Hex, {
        fast_travel_unlocked: ["FT_A"],
        effigies_found: ["EF_A"],
        bosses_defeated: ["Boss_A"],
      }),
      player(p2Hex, {
        fast_travel_unlocked: ["FT_B"],
        effigies_found: ["EF_B"],
        bosses_defeated: ["BOSS_Hunter"],
        towers_defeated: ["Tower_Grass"],
      }),
    ],
  };

  const stats = buildProgressStats(summary, species, mapData, mapState, "all");

  expect(stats.baseCount).toBe(2);
  expect(stats.ownedPalCount).toBe(2);
  expect(stats.capturedSpecies).toEqual({ found: 3, total: 3 });
  expect(stats.fastTravel).toEqual({ found: 2, total: 2 });
  expect(stats.effigies).toEqual({ found: 2, total: 2 });
  expect(stats.fieldBosses).toEqual({ found: 1, total: 1, joined: true });
  expect(stats.wantedFugitives).toEqual({ found: 1, total: 1, joined: true });
  expect(stats.towerRegions).toEqual({ found: 1, total: 1, joined: true });
});

test("pal collection classifies captured, discovered, and undiscovered species", () => {
  const p1Hex = "0102030405060708090a0b0c0d0e0f10";
  const summary: SaveSummary = {
    world_name: "Mosslight",
    players: [
      savePlayer(
        p1Hex,
        "Ada",
        { SheepBall: 4, PinkCat: 0 },
        ["SheepBall", "PinkCat"],
      ),
    ],
    pals: [],
    bases: [],
    warnings: [],
  };

  const collection = buildPalCollectionProgress(summary, species, p1Hex);

  expect(collection.total).toBe(3);
  expect(collection.captured.map((s) => s.name)).toEqual(["Lamball"]);
  expect(collection.discovered.map((s) => s.name)).toEqual(["Cattiva"]);
  expect(collection.undiscovered.map((s) => s.name)).toEqual(["Pengullet"]);
});

test("pal collection unions lifetime data for all-player scope", () => {
  const p1Hex = "0102030405060708090a0b0c0d0e0f10";
  const p2Hex = "2122232425262728292a2b2c2d2e2f30";
  const summary: SaveSummary = {
    world_name: "Mosslight",
    players: [
      savePlayer(p1Hex, "Ada", { SheepBall: 1, PinkCat: 0 }, [
        "SheepBall",
        "PinkCat",
      ]),
      savePlayer(p2Hex, "Bea", { PinkCat: 2, Penguin: 0 }, [
        "PinkCat",
        "Penguin",
      ]),
    ],
    pals: [],
    bases: [],
    warnings: [],
  };

  const p1Collection = buildPalCollectionProgress(summary, species, p1Hex);
  const allCollection = buildPalCollectionProgress(summary, species, "all");

  expect(p1Collection.captured.map((s) => s.id)).toEqual(["SheepBall"]);
  expect(p1Collection.discovered.map((s) => s.id)).toEqual(["PinkCat"]);
  expect(p1Collection.undiscovered.map((s) => s.id)).toEqual(["Penguin"]);
  expect(allCollection.captured.map((s) => s.id)).toEqual([
    "SheepBall",
    "PinkCat",
  ]);
  expect(allCollection.discovered.map((s) => s.id)).toEqual(["Penguin"]);
  expect(allCollection.undiscovered).toEqual([]);
});

test("pal collection treats zero-count captures as not captured", () => {
  const p1Hex = "0102030405060708090a0b0c0d0e0f10";
  const summary: SaveSummary = {
    world_name: "Mosslight",
    players: [
      savePlayer(p1Hex, "Ada", { SheepBall: 0, PinkCat: 0 }, ["PinkCat"]),
    ],
    pals: [],
    bases: [],
    warnings: [],
  };

  const collection = buildPalCollectionProgress(summary, species, p1Hex);

  expect(collection.captured).toEqual([]);
  expect(collection.discovered.map((s) => s.id)).toEqual(["PinkCat"]);
  expect(collection.undiscovered.map((s) => s.id)).toEqual([
    "SheepBall",
    "Penguin",
  ]);
});
