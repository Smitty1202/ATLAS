import { describe, expect, test } from "bun:test";
import type { OwnedPal, PassiveEntry, SpeciesEntry } from "../../lib/types";
import { buildRosterIntelligence } from "./roster-intelligence";

let nextId = 1;

function guid(seed = nextId++): number[] {
  return Array.from({ length: 16 }, (_, index) => (seed + index) % 255);
}

function pal(character_id: string, overrides: Partial<OwnedPal> = {}): OwnedPal {
  return {
    instance_id: guid(),
    character_id,
    is_boss: false,
    is_lucky: false,
    is_human: false,
    gender: "Male",
    level: 50,
    rank: 0,
    passives: [],
    active_skills: [],
    ivs: { hp: 70, attack: 70, defense: 70 },
    nickname: null,
    owner_player_uid: null,
    container_id: null,
    slot_index: 0,
    container_kind: "Palbox",
    ...overrides,
  };
}

function species(
  id: string,
  work: Partial<Record<"mining" | "lumbering" | "transporting", number>> = {},
  overrides: Partial<SpeciesEntry> = {},
): SpeciesEntry {
  const suitability = Array(12).fill(0) as number[];
  suitability[7] = work.mining ?? 0;
  suitability[6] = work.lumbering ?? 0;
  suitability[10] = work.transporting ?? 0;
  return {
    id,
    name: id,
    paldex_no: 1,
    is_variant: false,
    combi_rank: 1000,
    combi_rank_priority: 0,
    male_probability: 0.5,
    stats: {
      hp: 100,
      attack: 100,
      defense: 100,
      rarity: 1,
      price: 1000,
      craft_speed: 100,
      slow_walk_speed: 100,
      walk_speed: 100,
      run_speed: 500,
      ride_sprint_speed: -1,
      transport_speed: 300,
      stamina: 100,
      max_full_stomach: 100,
      size: "M",
      male_probability: 50,
      support: 100,
      capture_rate_correct: 1,
      exp_ratio: 1,
    },
    guaranteed_passives: [],
    work_suitability: suitability,
    partner_skill: null,
    partner_skill_desc: null,
    partner_skill_template: null,
    partner_skill_values: [],
    partner_skill_icon: null,
    nocturnal: false,
    food_amount: 5,
    wild_levels: [1, 50],
    elements: ["Normal"],
    ...overrides,
  };
}

function passive(
  id: string,
  rank: number,
  effect: string,
  name = id,
): PassiveEntry {
  return {
    id,
    name,
    rank,
    effects: [{ type: effect, value: 20, target: "ToSelf" }],
    description: null,
    pal_facing: true,
    tier: null,
  };
}

const passives = new Map<string, PassiveEntry>([
  ["MiningForeman", passive("MiningForeman", 3, "Mining", "Mining Foreman")],
  ["LoggingForeman", passive("LoggingForeman", 3, "Logging", "Logging Foreman")],
  ["Artisan", passive("Artisan", 3, "CraftSpeed", "Artisan")],
  ["Runner", passive("Runner", 2, "MoveSpeed", "Runner")],
  ["Musclehead", passive("Musclehead", 3, "ShotAttack", "Musclehead")],
]);

function role(summary: ReturnType<typeof buildRosterIntelligence>, name: string) {
  return summary.roles.find((entry) => entry.role === name)!;
}

describe("cross-species Roster Intelligence", () => {
  test("work suitability outranks generic level and IV padding", () => {
    const specialist = species("Miner4", { mining: 4 });
    const padded = species("Miner2", { mining: 2 });
    const summary = buildRosterIntelligence(
      [
        pal("Miner4", { level: 20, ivs: { hp: 20, attack: 20, defense: 20 } }),
        pal("Miner2", { level: 70, ivs: { hp: 100, attack: 100, defense: 100 }, passives: ["Artisan"] }),
      ],
      new Map([[specialist.id, specialist], [padded.id, padded]]),
      passives,
    );
    expect(role(summary, "mining").candidates[0]?.species.id).toBe("Miner4");
  });

  test("role-specific passive evidence breaks equal-suitability ties before generic work support", () => {
    const a = species("Specific", { mining: 3 });
    const b = species("Generic", { mining: 3 });
    const summary = buildRosterIntelligence(
      [
        pal("Specific", { passives: ["MiningForeman"] }),
        pal("Generic", { passives: ["Artisan"], level: 70 }),
      ],
      new Map([[a.id, a], [b.id, b]]),
      passives,
    );
    expect(role(summary, "mining").candidates[0]?.species.id).toBe("Specific");
  });

  test("transport speed is a deterministic tie-breaker after suitability and passive evidence", () => {
    const slow = species("SlowHauler", { transporting: 3 }, {
      stats: { ...species("tmp").stats, transport_speed: 250 },
    });
    const fast = species("FastHauler", { transporting: 3 }, {
      stats: { ...species("tmp2").stats, transport_speed: 500 },
    });
    const summary = buildRosterIntelligence(
      [pal("SlowHauler"), pal("FastHauler")],
      new Map([[slow.id, slow], [fast.id, fast]]),
      passives,
    );
    expect(role(summary, "transporting").candidates[0]?.species.id).toBe("FastHauler");
  });

  test("shows one best instance per species so duplicates do not crowd out cross-species options", () => {
    const anubis = species("Anubis", { mining: 4 });
    const knocklem = species("Knocklem", { mining: 4 });
    const summary = buildRosterIntelligence(
      [
        pal("Anubis", { passives: ["MiningForeman"] }),
        pal("Anubis", { level: 70 }),
        pal("Anubis", { rank: 2 }),
        pal("Knocklem"),
      ],
      new Map([[anubis.id, anubis], [knocklem.id, knocklem]]),
      passives,
    );
    expect(role(summary, "mining").candidates.map((entry) => entry.species.id)).toEqual(["Anubis", "Knocklem"]);
  });

  test("combat passive evidence outranks raw species attack when explicit evidence exists", () => {
    const tuned = species("Tuned", {}, { stats: { ...species("tmp3").stats, attack: 110 } });
    const raw = species("Raw", {}, { stats: { ...species("tmp4").stats, attack: 180 } });
    const summary = buildRosterIntelligence(
      [pal("Tuned", { passives: ["Musclehead"] }), pal("Raw", { ivs: { hp: 100, attack: 100, defense: 100 } })],
      new Map([[tuned.id, tuned], [raw.id, raw]]),
      passives,
    );
    expect(role(summary, "combat").candidates[0]?.species.id).toBe("Tuned");
  });

  test("coverage calls out weak, thin, and healthy specialist depth explicitly", () => {
    const one = species("One", { lumbering: 3 });
    const two = species("Two", { lumbering: 3 });
    const weak = species("Weak", { mining: 2 });

    const thinSummary = buildRosterIntelligence(
      [pal("One"), pal("Weak")],
      new Map([[one.id, one], [weak.id, weak]]),
      passives,
    );
    expect(role(thinSummary, "lumbering").coverage).toBe("thin");
    expect(role(thinSummary, "mining").coverage).toBe("weak");

    const healthySummary = buildRosterIntelligence(
      [pal("One"), pal("Two")],
      new Map([[one.id, one], [two.id, two]]),
      passives,
    );
    expect(role(healthySummary, "lumbering").coverage).toBe("healthy");
  });

  test("humans are excluded from roster recommendations", () => {
    const humanSpecies = species("HumanLike", { mining: 5 });
    const worker = species("Worker", { mining: 2 });
    const summary = buildRosterIntelligence(
      [pal("HumanLike", { is_human: true }), pal("Worker")],
      new Map([[humanSpecies.id, humanSpecies], [worker.id, worker]]),
      passives,
    );
    expect(role(summary, "mining").candidates[0]?.species.id).toBe("Worker");
  });
});
