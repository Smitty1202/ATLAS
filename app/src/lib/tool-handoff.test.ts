import { describe, expect, test } from "bun:test";
import {
  buildIvLabHandoff,
  buildSolverHandoff,
  handoffView,
} from "./tool-handoff";

const subject = {
  speciesId: "Anubis",
  speciesName: "Anubis",
  instanceId: "abc123",
  instanceLabel: "Atlas",
};

describe("Pal Intelligence tool handoffs", () => {
  test("solver payload normalizes visible target passives and routes to Solver", () => {
    const handoff = buildSolverHandoff(subject, {
      requiredPassives: ["Musclehead", " Serenity ", "Musclehead", ""],
      reason: "Best combat copy",
    });
    expect(handoff).not.toBeNull();
    expect(handoff?.requiredPassives).toEqual(["Musclehead", "Serenity"]);
    expect(handoff?.subject.instanceId).toBe("abc123");
    expect(handoff && handoffView(handoff)).toBe("solver");
  });

  test("IV Lab carries suggested floors without making them mandatory", () => {
    const handoff = buildIvLabHandoff(subject, {
      suggestedIvs: { hp: 110, attack: 82.4, defense: -5 },
      reason: "Species-best owned IVs",
    });
    expect(handoff?.suggestedIvs).toEqual({ hp: 100, attack: 82, defense: 0 });
    expect(handoff && handoffView(handoff)).toBe("ivlab");
  });

  test("no-data subjects fail soft and zero IV suggestions are omitted", () => {
    expect(buildSolverHandoff(null)).toBeNull();
    expect(buildIvLabHandoff({ speciesId: "", speciesName: "Anubis" })).toBeNull();
    expect(
      buildIvLabHandoff(subject, {
        suggestedIvs: { hp: 0, attack: 0, defense: 0 },
      })?.suggestedIvs,
    ).toBeUndefined();
  });
});
