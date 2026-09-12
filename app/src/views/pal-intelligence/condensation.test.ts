import { describe, expect, test } from "bun:test";
import type { OwnedPal, PassiveEntry } from "../../lib/types";
import { buildCondensationSummary } from "./condensation";

const A = Array.from({ length: 16 }, (_, i) => i + 1);
const B = Array.from({ length: 16 }, (_, i) => i + 21);
const C = Array.from({ length: 16 }, (_, i) => i + 41);
const D = Array.from({ length: 16 }, (_, i) => i + 61);
const E = Array.from({ length: 16 }, (_, i) => i + 81);

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

function passive(id: string, rank: number, name = id, effectType = "CraftSpeed"): PassiveEntry {
  return {
    id,
    name,
    rank,
    effects: [{ type: effectType, value: 20, target: "ToSelf" }],
    description: null,
    pal_facing: true,
    tier: null,
  };
}

const rows = new Map<string, PassiveEntry>([
  ["Artisan", passive("Artisan", 3, "Artisan")],
  ["Legend", passive("Legend", 4, "Legend", "MoveSpeed")],
  ["Musclehead", passive("Musclehead", 3, "Musclehead", "ShotAttack")],
  ["Clumsy", passive("Clumsy", -1, "Clumsy")],
]);

function materialFor(summary: ReturnType<typeof buildCondensationSummary>, id: number[]) {
  const key = id.join("-");
  return [...summary.safe, ...summary.protected, ...summary.review].find((entry) => entry.pal.instance_id.join("-") === key);
}

describe("Condensation Intelligence", () => {
  test("marks a truly dominated unprotected copy safe to condense", () => {
    const weak = pal({ instance_id: A, level: 10, passives: ["Clumsy"], ivs: { hp: 20, attack: 20, defense: 20 } });
    const strong = pal({ instance_id: B, level: 40, passives: [], ivs: { hp: 80, attack: 80, defense: 80 } });
    const summary = buildCondensationSummary([weak, strong], rows);
    const entry = materialFor(summary, A);
    expect(entry?.kind).toBe("safe");
    expect(entry?.dominant?.instance_id).toEqual(B);
    expect(summary.safeMaterialCount).toBe(1);
  });

  test("protects Alpha / special-status copies", () => {
    const alpha = pal({ instance_id: A, is_lucky: true, level: 10, ivs: { hp: 20, attack: 20, defense: 20 } });
    const strong = pal({ instance_id: B, level: 40, ivs: { hp: 80, attack: 80, defense: 80 } });
    const entry = materialFor(buildCondensationSummary([alpha, strong], rows), A);
    expect(entry?.kind).toBe("protected");
    expect(entry?.reasons.join(" ")).toContain("Lucky/rare Alpha");
  });

  test("protects existing condensation investment even when a stronger copy exists", () => {
    const invested = pal({ instance_id: A, rank: 1, level: 10, ivs: { hp: 20, attack: 20, defense: 20 } });
    const strong = pal({ instance_id: B, rank: 2, level: 40, ivs: { hp: 80, attack: 80, defense: 80 } });
    const entry = materialFor(buildCondensationSummary([invested, strong], rows), A);
    expect(entry?.kind).toBe("protected");
    expect(entry?.reasons.join(" ")).toContain("Condense 1/4");
  });

  test("protects the breeding core and the only owned gender", () => {
    const male = pal({ instance_id: A, gender: "Male", ivs: { hp: 20, attack: 20, defense: 20 } });
    const female1 = pal({ instance_id: B, gender: "Female", level: 30, ivs: { hp: 70, attack: 70, defense: 70 } });
    const female2 = pal({ instance_id: C, gender: "Female", level: 20, ivs: { hp: 60, attack: 60, defense: 60 } });
    const entry = materialFor(buildCondensationSummary([male, female1, female2], rows), A);
    expect(entry?.kind).toBe("protected");
    expect(entry?.reasons.join(" ")).toContain("male breeding-core");
    expect(entry?.reasons.join(" ")).toContain("Only owned male copy");
  });

  test("protects unique positive passive and equipped-move carriers", () => {
    const carrier = pal({ instance_id: A, passives: ["Artisan"], active_skills: ["Unique_SheepBall_Roll"], ivs: { hp: 20, attack: 20, defense: 20 } });
    const strong = pal({ instance_id: B, level: 40, ivs: { hp: 80, attack: 80, defense: 80 } });
    const entry = materialFor(buildCondensationSummary([carrier, strong], rows), A);
    expect(entry?.kind).toBe("protected");
    const text = entry?.reasons.join(" ") ?? "";
    expect(text).toContain("Artisan");
    expect(text).toContain("Unique_SheepBall_Roll");
  });

  test("protects sole species-best IV coverage", () => {
    const hpCarrier = pal({ instance_id: A, level: 10, ivs: { hp: 100, attack: 10, defense: 10 } });
    const balanced = pal({ instance_id: B, level: 50, ivs: { hp: 90, attack: 90, defense: 90 } });
    const entry = materialFor(buildCondensationSummary([hpCarrier, balanced], rows), A);
    expect(entry?.kind).toBe("protected");
    expect(entry?.reasons.join(" ")).toContain("HP 100");
  });

  test("sends ambiguous non-dominated copies to review instead of safe", () => {
    const baseline = pal({ instance_id: A, level: 40, ivs: { hp: 80, attack: 80, defense: 80 } });
    const atk = pal({ instance_id: B, level: 30, ivs: { hp: 70, attack: 95, defense: 70 } });
    const hp = pal({ instance_id: C, level: 30, ivs: { hp: 95, attack: 70, defense: 70 } });
    const ambiguous = pal({ instance_id: D, level: 20, ivs: { hp: 85, attack: 75, defense: 75 } });
    const spare = pal({ instance_id: E, level: 10, ivs: { hp: 10, attack: 10, defense: 10 } });
    const summary = buildCondensationSummary([baseline, atk, hp, ambiguous, spare], rows);
    const entry = materialFor(summary, D);
    expect(entry?.kind).toBe("review");
    expect(entry?.reasons.join(" ")).toContain("No fully preserving same-gender dominator");
    expect(materialFor(summary, E)?.kind).toBe("safe");
  });

  test("recommended combat and worker targets are always protected", () => {
    const fighter = pal({ instance_id: A, passives: ["Musclehead"], ivs: { hp: 70, attack: 95, defense: 70 } });
    const worker = pal({ instance_id: B, passives: ["Artisan"], gender: "Female", ivs: { hp: 70, attack: 70, defense: 70 } });
    const summary = buildCondensationSummary([fighter, worker], rows);
    for (const target of summary.targets) {
      expect(materialFor(summary, target.pal.instance_id)?.kind).toBe("protected");
    }
    expect(summary.targets.length > 0).toBe(true);
  });
});
