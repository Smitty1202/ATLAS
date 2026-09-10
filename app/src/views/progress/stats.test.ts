import { expect, test } from "bun:test";
import type { MapData } from "../../lib/map-coords";
import type {
  Guid,
  MapPlayerState,
  MapState,
  OwnedPal,
  SaveSummary,
  SpeciesEntry,
} from "../../lib/types";
import { buildProgressStats } from "./stats";

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

const species: SpeciesEntry[] = [
  { id: "SheepBall", name: "Lamball" },
  { id: "PinkCat", name: "Cattiva" },
  { id: "Penguin", name: "Pengullet" },
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

test("progress stats honor player scope, exclude humans, and reuse map POI joins", () => {
  const p1 = guid(1);
  const p2 = guid(33);
  const p1Hex = "0102030405060708090a0b0c0d0e0f10";
  const p2Hex = "2122232425262728292a2b2c2d2e2f30";
  const summary: SaveSummary = {
    world_name: "Mosslight",
    players: [
      { uid: p1Hex, name: "Ada" },
      { uid: p2Hex, name: "Bea" },
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
  expect(stats.capturedSpecies).toEqual({ found: 1, total: 3 });
  expect(stats.fastTravel).toEqual({ found: 1, total: 2 });
  expect(stats.effigies).toEqual({ found: 1, total: 2 });
  expect(stats.fieldBosses).toEqual({ found: 1, total: 1, joined: true });
  expect(stats.wantedFugitives).toEqual({ found: 0, total: 1, joined: true });
  expect(stats.towerRegions).toEqual({ found: 1, total: 1, joined: true });
});

test("all-player progress unions map flags and species ownership", () => {
  const p1 = guid(1);
  const p2 = guid(33);
  const p1Hex = "0102030405060708090a0b0c0d0e0f10";
  const p2Hex = "2122232425262728292a2b2c2d2e2f30";
  const summary: SaveSummary = {
    world_name: "Mosslight",
    players: [
      { uid: p1Hex, name: "Ada" },
      { uid: p2Hex, name: "Bea" },
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
  expect(stats.capturedSpecies).toEqual({ found: 2, total: 3 });
  expect(stats.fastTravel).toEqual({ found: 2, total: 2 });
  expect(stats.effigies).toEqual({ found: 2, total: 2 });
  expect(stats.fieldBosses).toEqual({ found: 1, total: 1, joined: true });
  expect(stats.wantedFugitives).toEqual({ found: 1, total: 1, joined: true });
  expect(stats.towerRegions).toEqual({ found: 1, total: 1, joined: true });
});
