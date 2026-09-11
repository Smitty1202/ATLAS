import { describe, expect, test } from "bun:test";
import type { OwnedPal, PassiveEntry } from "../../lib/types";
import { recommendIntelPal, safelyDominates } from "./recommendations";

const A = Array.from({ length: 16 }, (_, i) => i + 1);
const B = Array.from({ length: 16 }, (_, i) => i + 21);
const C = Array.from({ length: 16 }, (_, i) => i + 41);

function pal(overrides: Partial<OwnedPal> = {}): OwnedPal {
  return {
    instance_id: A,
    character_id: "SheepBall",
    is_boss: false,
    is_lucky: false,
    is_human: false,
    gender: "Male",
    level: 20,
    rank: 0,
    passives: [],
    active_skills: [],
    ivs: { hp: 50, attack: 50, defense: 50 },
    nickname: null,
    owner_player_uid: A,
    container_id: null,
    slot_index: 0,
    container_kind: "Palbox",
    ...overrides,
  };
}

function passive(id: string, rank: number, name = id): PassiveEntry {
  return {
    id,
    name,
    rank,
    effects: [],
    description: null,
    pal_facing: true,
    tier: null,
  };
}

const rows = new Map<string, PassiveEntry>([
  ["Artisan", passive("Artisan", 3, "Artisan")],
  ["Legend", passive("Legend", 4, "Legend")],
  ["Clumsy", passive("Clumsy", -1, "Clumsy")],
]);

describe("Pal Intelligence recommendations", () => {
  test("marks a Pal redundant only when a same-gender copy safely dominates it", () => {
    const weak = pal({ instance_id: A, passives: ["Artisan", "Clumsy"], ivs: { hp: 40, attack: 45, defense: 50 } });
    const strong = pal({
      instance_id: B,
      level: 30,
      rank: 1,
      passives: ["Artisan"],
      ivs: { hp: 60, attack: 70, defense: 80 },
    });

    expect(safelyDominates(strong, weak, rows)).toBe(true);
    const result = recommendIntelPal(weak, [weak, strong], rows);
    expect(result.kind).toBe("redundant");
    expect(result.dominant?.instance_id).toEqual(B);
  });

  test("does not use an opposite-gender copy as redundancy proof", () => {
    const male = pal({ instance_id: A, ivs: { hp: 30, attack: 30, defense: 30 } });
    const female = pal({
      instance_id: B,
      gender: "Female",
      level: 50,
      ivs: { hp: 90, attack: 90, defense: 90 },
    });

    expect(safelyDominates(female, male, rows)).toBe(false);
    expect(recommendIntelPal(male, [male, female], rows).kind).not.toBe("redundant");
  });

  test("keeps condensed investment", () => {
    const invested = pal({ instance_id: A, rank: 2, ivs: { hp: 40, attack: 40, defense: 40 } });
    const peer = pal({ instance_id: B, gender: "Female", ivs: { hp: 90, attack: 90, defense: 90 } });
    const result = recommendIntelPal(invested, [invested, peer], rows);
    expect(result.kind).toBe("keep");
    expect(result.reasons.join(" ")).toContain("Condensed to 2/4");
  });

  test("keeps a high-tier passive carrier", () => {
    const rare = pal({ instance_id: A, passives: ["Legend"], ivs: { hp: 20, attack: 20, defense: 20 } });
    const peer = pal({ instance_id: B, gender: "Female", ivs: { hp: 90, attack: 90, defense: 90 } });
    const result = recommendIntelPal(rare, [rare, peer], rows);
    expect(result.kind).toBe("keep");
    expect(result.reasons.join(" ")).toContain("Legend (Rank 4)");
  });

  test("uses Breeding Candidate for unique ordinary breeding value", () => {
    const breeder = pal({
      instance_id: A,
      passives: ["Artisan"],
      ivs: { hp: 45, attack: 45, defense: 45 },
    });
    const peer = pal({
      instance_id: B,
      gender: "Female",
      ivs: { hp: 80, attack: 80, defense: 80 },
    });
    const result = recommendIntelPal(breeder, [breeder, peer], rows);
    expect(result.kind).toBe("breeding_candidate");
    expect(result.reasons.join(" ")).toContain("Artisan (Rank 3)");
  });

  test("preserves a unique equipped move before calling a Pal redundant", () => {
    const moveCarrier = pal({
      instance_id: A,
      active_skills: ["Unique_SheepBall_Roll"],
      ivs: { hp: 30, attack: 30, defense: 30 },
    });
    const stronger = pal({
      instance_id: B,
      level: 50,
      ivs: { hp: 90, attack: 90, defense: 90 },
    });

    expect(safelyDominates(stronger, moveCarrier, rows)).toBe(false);
    const result = recommendIntelPal(moveCarrier, [moveCarrier, stronger], rows);
    expect(result.kind).toBe("breeding_candidate");
    expect(result.reasons.join(" ")).toContain("Unique_SheepBall_Roll");
  });

  test("allows removing a negative passive as an improvement", () => {
    const target = pal({ instance_id: A, passives: ["Clumsy"] });
    const candidate = pal({ instance_id: C, level: 21, passives: [] });
    expect(safelyDominates(candidate, target, rows)).toBe(true);
  });
});
