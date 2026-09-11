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