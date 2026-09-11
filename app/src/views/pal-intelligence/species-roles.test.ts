import { describe, expect, test } from "bun:test";
import type { OwnedPal, PassiveEntry } from "../../lib/types";
import { buildSpeciesRoleSummary } from "./species-roles";

const A = Array.from({ length: 16 }, (_, index) => index + 1);
const B = Array.from({ length: 16 }, (_, index) => index + 21);
const C = Array.from({ length: 16 }, (_, index) => index + 41);
const D = Array.from({ length: 16 }, (_, index) => index + 61);

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

function passive(
  id: string,
  rank: number,
  effectType: string,
  name = id,
  value = 20,
): PassiveEntry {
  return {
    id,
    name,
    rank,
    effects: [{ type: effectType, value, target: "ToSelf" }],
    description: null,
    pal_facing: true,
    tier: null,
  };
}

const rows = new Map<string, PassiveEntry>([
  ["Musclehead", passive("Musclehead", 3, "ShotAttack", "Musclehead", 30)],
  ["Serenity", passive("Serenity", 3, "ActiveSkillCoolTime_Decrease", "Serenity", -30)],
  ["Artisan", passive("Artisan", 3, "CraftSpeed", "Artisan", 50)],
  ["WorkSlave", passive("WorkSlave", 2, "CraftSpeed", "Work Slave", 30)],
  ["Workaholic", passive("Workaholic", 3, "CraftSpeed", "Workaholic", 30)],
  ["Immovable", passive("Immovable", 4, "Sanity_Decrease", "Heart of the Immovable King", -20)],
  ["Legend", passive("Legend", 4, "MoveSpeed", "Legend", 15)],
  ["Clumsy", passive("Clumsy", -1, "CraftSpeed", "Clumsy", -10)],
]);

describe("Pal Intelligence species role picks", () => {
  test("combat pick favors explicit combat-passive evidence before raw IVs", () => {
    const fighter = pal({
      instance_id: A,
      passives: ["Musclehead", "Serenity"],
      ivs: { hp: 70, attack: 82, defense: 70 },
    });
    const rawIvs = pal({
      instance_id: B,
      gender: "Female",
      ivs: { hp: 100, attack: 100, defense: 100 },
    });

    const summary = buildSpeciesRoleSummary([fighter, rawIvs], rows);
    expect(summary.combat?.pal.instance_id).toEqual(A);
    expect(summary.combat?.reasons.join(" ")).toContain("Musclehead");
    expect(summary.combat?.reasons.join(" ")).toContain("Serenity");
  });

  test("worker pick favors work-specific passives over unrelated combat stats", () => {
    const worker = pal({
      instance_id: A,
      passives: ["Artisan", "WorkSlave"],
      ivs: { hp: 30, attack: 30, defense: 30 },
    });
    const fighter = pal({
      instance_id: B,
      gender: "Female",
      passives: ["Musclehead"],
      rank: 3,
      level: 55,
      ivs: { hp: 95, attack: 95, defense: 95 },
    });

    const summary = buildSpeciesRoleSummary([worker, fighter], rows);
    expect(summary.worker?.pal.instance_id).toEqual(A);
    expect(summary.worker?.reasons.join(" ")).toContain("Artisan");
  });

  test("worker productivity outranks higher-tier sustainability", () => {
    const sustainability = pal({
      instance_id: A,
      passives: ["Immovable"],
      rank: 4,
      level: 55,
      ivs: { hp: 95, attack: 95, defense: 95 },
    });
    const productive = pal({
      instance_id: B,
      gender: "Female",
      passives: ["Workaholic"],
      ivs: { hp: 30, attack: 30, defense: 30 },
    });

    const summary = buildSpeciesRoleSummary([sustainability, productive], rows);
    expect(summary.worker?.pal.instance_id).toEqual(B);
    expect(summary.worker?.reasons.join(" ")).toContain("Productivity passives: Workaholic (R3)");
    expect(summary.worker?.reasons.join(" ")).not.toContain("Heart of the Immovable King");
  });

  test("breeding core selects male and female independently", () => {
    const maleUnique = pal({
      instance_id: A,
      gender: "Male",
      passives: ["Artisan"],
      ivs: { hp: 60, attack: 60, defense: 60 },
    });
    const maleRawIvs = pal({
      instance_id: B,
      gender: "Male",
      ivs: { hp: 90, attack: 90, defense: 90 },
    });
    const female = pal({
      instance_id: C,
      gender: "Female",
      passives: ["Legend"],
      ivs: { hp: 100, attack: 70, defense: 70 },
    });

    const summary = buildSpeciesRoleSummary([maleUnique, maleRawIvs, female], rows);
    expect(summary.breeding.male?.pal.instance_id).toEqual(A);
    expect(summary.breeding.female?.pal.instance_id).toEqual(C);
    expect(summary.breeding.male?.reasons.join(" ")).toContain("Unique positive passive");
    expect(summary.breeding.female?.reasons.join(" ")).toContain("HP 100");
  });

  test("breeding core reports a missing opposite-gender side instead of substituting", () => {
    const maleA = pal({ instance_id: A, gender: "Male", passives: ["Artisan"] });
    const maleB = pal({ instance_id: B, gender: "Male", ivs: { hp: 80, attack: 80, defense: 80 } });

    const summary = buildSpeciesRoleSummary([maleA, maleB], rows);
    expect(summary.breeding.male).not.toBeNull();
    expect(summary.breeding.female).toBeNull();
  });

  test("worker tie-breaking preserves condensation investment and avoids penalties", () => {
    const cleanInvested = pal({ instance_id: A, rank: 2 });
    const penalized = pal({ instance_id: B, gender: "Female", rank: 2, level: 50, passives: ["Clumsy"] });
    const uninvested = pal({ instance_id: D, gender: "Female", level: 60 });

    const summary = buildSpeciesRoleSummary([cleanInvested, penalized, uninvested], rows);
    expect(summary.worker?.pal.instance_id).toEqual(A);
  });
});
