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
  ["MinorA", passive("MinorA", 2, "Minor A", "FriendshipUp")],
  ["MinorB", passive("MinorB", 2, "Minor B", "FriendshipUp")],
  ["Clumsy", passive("Clumsy", -1, "Clumsy")],
]);

function materialFor(summary: ReturnType<typeof buildCondensationSummary>, id: number[]) {
  const key = id.join("-");
  return [...summary.safe, ...summary.likely, ...summary.protected, ...summary.review].find(
    (entry) => entry.pal.instance_id.join("-") === key,
  );
}

describe("Condensation Intelligence", () => {
  test("marks a clearly inferior copy safe when the keeper core preserves its evidence", () => {
    const weak = pal({ instance_id: A, level: 10, passives: ["Clumsy"], ivs: { hp: 20, attack: 20, defense: 20 } });
    const strong = pal({ instance_id: B, level: 40, passives: [], ivs: { hp: 80, attack: 80, defense: 80 } });
    const summary = buildCondensationSummary([weak, strong], rows);
    expect(materialFor(summary, A)?.kind).toBe("safe");
    expect(summary.safeMaterialCount).toBe(1);
  });

  test("protects Alpha / special-status copies", () => {
    const alpha = pal({ instance_id: A, is_lucky: true, level: 10, ivs: { hp: 20, attack: 20, defense: 20 } });
    const strong = pal({ instance_id: B, level: 40, ivs: { hp: 80, attack: 80, defense: 80 } });
    const entry = materialFor(buildCondensationSummary([alpha, strong], rows), A);
    expect(entry?.kind).toBe("protected");
    expect(entry?.reasons.join(" ")).toContain("Lucky/rare Alpha");
  });

  test("protects existing condensation investment", () => {
    const invested = pal({ instance_id: A, rank: 1, level: 10, ivs: { hp: 20, attack: 20, defense: 20 } });
    const strong = pal({ instance_id: B, level: 40, ivs: { hp: 80, attack: 80, defense: 80 } });
    const entry = materialFor(buildCondensationSummary([invested, strong], rows), A);
    expect(entry?.kind).toBe("protected");
    expect(entry?.reasons.join(" ")).toContain("Condense 1/4");
  });

  test("protects breeding-core gender coverage", () => {
    const male = pal({ instance_id: A, gender: "Male", ivs: { hp: 20, attack: 20, defense: 20 } });
    const female1 = pal({ instance_id: B, gender: "Female", level: 30, ivs: { hp: 70, attack: 70, defense: 70 } });
    const female2 = pal({ instance_id: C, gender: "Female", level: 20, ivs: { hp: 60, attack: 60, defense: 60 } });
    const entry = materialFor(buildCondensationSummary([male, female1, female2], rows), A);
    expect(entry?.kind).toBe("protected");
    expect(entry?.reasons.join(" ")).toContain("male breeding-core");
    expect(entry?.reasons.join(" ")).toContain("Only owned male copy");
  });

  test("consolidates duplicate high-value passive coverage instead of protecting every carrier", () => {
    const weakArtisan = pal({ instance_id: A, passives: ["Artisan"], ivs: { hp: 20, attack: 20, defense: 20 } });
    const strongArtisan = pal({ instance_id: B, level: 50, passives: ["Artisan"], ivs: { hp: 95, attack: 95, defense: 95 } });
    const female = pal({ instance_id: C, gender: "Female", level: 40, ivs: { hp: 90, attack: 90, defense: 90 } });
    const summary = buildCondensationSummary([weakArtisan, strongArtisan, female], rows);
    expect(materialFor(summary, strongArtisan.instance_id)?.kind).toBe("protected");
    expect(materialFor(summary, weakArtisan.instance_id)?.kind).toBe("safe");
  });

  test("preserves one best-IV carrier instead of every tied carrier", () => {
    const tiedWeak = pal({ instance_id: A, ivs: { hp: 100, attack: 20, defense: 20 } });
    const tiedStrong = pal({ instance_id: B, level: 50, ivs: { hp: 100, attack: 95, defense: 95 } });
    const female = pal({ instance_id: C, gender: "Female", ivs: { hp: 80, attack: 80, defense: 80 } });
    const summary = buildCondensationSummary([tiedWeak, tiedStrong, female], rows);
    expect(materialFor(summary, tiedStrong.instance_id)?.kind).toBe("protected");
    expect(materialFor(summary, tiedWeak.instance_id)?.kind).toBe("safe");
  });

  test("puts lower-tier unique passive convenience in Likely Fodder, not Protected", () => {
    const betterMinor = pal({ instance_id: A, passives: ["MinorA"], ivs: { hp: 70, attack: 70, defense: 70 } });
    const spareMinor = pal({ instance_id: B, passives: ["MinorB"], ivs: { hp: 40, attack: 40, defense: 40 } });
    const strongMale = pal({ instance_id: C, level: 50, ivs: { hp: 95, attack: 95, defense: 95 } });
    const female = pal({ instance_id: D, gender: "Female", level: 40, ivs: { hp: 90, attack: 90, defense: 90 } });
    const summary = buildCondensationSummary([betterMinor, spareMinor, strongMale, female], rows);
    expect(materialFor(summary, spareMinor.instance_id)?.kind).toBe("likely");
    expect(materialFor(summary, spareMinor.instance_id)?.reasons.join(" ")).toContain("Minor B");
  });

  test("puts an otherwise disposable unique equipped move in Likely Fodder", () => {
    const moveCarrier = pal({ instance_id: A, active_skills: ["Odd_Move"], ivs: { hp: 20, attack: 20, defense: 20 } });
    const strongMale = pal({ instance_id: B, level: 50, ivs: { hp: 95, attack: 95, defense: 95 } });
    const female = pal({ instance_id: C, gender: "Female", level: 40, ivs: { hp: 90, attack: 90, defense: 90 } });
    const entry = materialFor(buildCondensationSummary([moveCarrier, strongMale, female], rows), A);
    expect(entry?.kind).toBe("likely");
    expect(entry?.reasons.join(" ")).toContain("Odd_Move");
  });

  test("keeps genuinely unknown passive metadata in Needs Review", () => {
    const unknown = pal({ instance_id: A, passives: ["MysteryPassive"], ivs: { hp: 20, attack: 20, defense: 20 } });
    const strongMale = pal({ instance_id: B, level: 50, ivs: { hp: 95, attack: 95, defense: 95 } });
    const female = pal({ instance_id: C, gender: "Female", level: 40, ivs: { hp: 90, attack: 90, defense: 90 } });
    const entry = materialFor(buildCondensationSummary([unknown, strongMale, female], rows), A);
    expect(entry?.kind).toBe("review");
    expect(entry?.reasons.join(" ")).toContain("MysteryPassive");
  });

  test("recommended combat and worker targets are always protected", () => {
    const fighter = pal({ instance_id: A, passives: ["Musclehead"], ivs: { hp: 70, attack: 95, defense: 70 } });
    const worker = pal({ instance_id: B, passives: ["Artisan"], gender: "Female", ivs: { hp: 70, attack: 70, defense: 70 } });
    const spare = pal({ instance_id: E, ivs: { hp: 20, attack: 20, defense: 20 } });
    const summary = buildCondensationSummary([fighter, worker, spare], rows);
    for (const target of summary.targets) {
      expect(materialFor(summary, target.pal.instance_id)?.kind).toBe("protected");
    }
    expect(summary.targets.length > 0).toBe(true);
  });
});
