from pathlib import Path
import re

root = Path(__file__).resolve().parents[2]

# --- Tighten combat coverage semantics without changing combat ranking. ---
path = root / "app/src/views/pal-intelligence/roster-intelligence.ts"
text = path.read_text(encoding="utf-8")

needle = '''function compareCombat(a: CombatEvidence, b: CombatEvidence): number {\n'''
insert = '''const COMBAT_COVERAGE_EFFECTS = new Set([\n  "ShotAttack",\n  "Defense",\n  "MaxHP",\n  "LifeSteal",\n  "ActiveSkillCoolTime_Decrease",\n]);\n\nfunction isHighConfidenceCombatPassive(row: PassiveEntry): boolean {\n  if (!highTier(row)) return false;\n  return row.effects.some((effect) =>\n    COMBAT_COVERAGE_EFFECTS.has(effect.type) || effect.type.startsWith("ElementBoost_"),\n  );\n}\n\nfunction combatTuningRows(evidence: CombatEvidence): PassiveEntry[] {\n  return evidence.passives.filter(isHighConfidenceCombatPassive);\n}\n\n'''
if insert not in text:
    if needle not in text:
        raise SystemExit("compareCombat anchor not found")
    text = text.replace(needle, insert + needle, 1)

pattern = re.compile(r'''function combatCoverage\(rows: CombatEvidence\[\]\): Pick<RosterRoleSummary, "coverage" \| "coverageReason"> \{.*?\n\}\n\nfunction buildWorkRole''', re.S)
replacement = '''function combatCoverage(rows: CombatEvidence[]): Pick<RosterRoleSummary, "coverage" | "coverageReason"> {\n  if (rows.length === 0) {\n    return { coverage: "missing", coverageReason: "No owned Pal is available for combat ranking." };\n  }\n\n  // Coverage is deliberately stricter than ranking. A single generic combat-ish\n  // passive is useful ranking evidence, but it does not prove that the roster has\n  // a purpose-built combat option. Count only species whose best owned copy has\n  // at least two high-tier (R3+/Rainbow/World Tree) offensive combat passives.\n  const tuned = rows.filter((row) => combatTuningRows(row).length >= 2);\n  if (tuned.length >= 3) {\n    return {\n      coverage: "healthy",\n      coverageReason: `${tuned.length} owned species have purpose-built combat tuning (2+ high-tier offensive combat passives).`,\n    };\n  }\n  if (tuned.length > 0) {\n    return {\n      coverage: "thin",\n      coverageReason: `${tuned.length} owned ${tuned.length === 1 ? "species has" : "species have"} purpose-built combat tuning; backup depth is limited.`,\n    };\n  }\n  return {\n    coverage: "weak",\n    coverageReason: "No owned species has 2+ high-tier offensive combat passives; rankings still show the best available stats and passive evidence.",\n  };\n}\n\nfunction buildWorkRole'''
text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit(f"combatCoverage replacement count={count}")
path.write_text(text, encoding="utf-8")

# --- Make role badges self-explanatory. ---
path = root / "app/src/views/pal-intelligence/roster-intelligence-panel.tsx"
text = path.read_text(encoding="utf-8")
needle = '''function CandidateRow({\n'''
insert = '''function roleBadge(candidate: RosterRoleCandidate): string {\n  if (candidate.suitability !== null) {\n    const label = candidate.role === "mining"\n      ? "Mining"\n      : candidate.role === "lumbering"\n        ? "Lumbering"\n        : "Transport";\n    return `${label} Lv${candidate.suitability}`;\n  }\n  return candidate.relevantPassives.length > 0\n    ? `${candidate.relevantPassives.length} combat traits`\n    : "Stats / IVs";\n}\n\n'''
if insert not in text:
    if needle not in text:
        raise SystemExit("CandidateRow anchor not found")
    text = text.replace(needle, insert + needle, 1)
old = '''            {candidate.suitability !== null && <Tag>{candidate.suitability} work</Tag>}'''
new = '''            <Tag>{roleBadge(candidate)}</Tag>'''
if old not in text:
    raise SystemExit("old role badge not found")
text = text.replace(old, new, 1)
path.write_text(text, encoding="utf-8")

# --- Switch the page heading/subtitle with the selected mode. ---
path = root / "app/src/views/PalIntelligence.tsx"
text = path.read_text(encoding="utf-8")
old = '''            <h1 className="mt-0.5 font-display text-xl font-bold tracking-wide text-ink">Owned Pal Inventory</h1>\n            <p className="mt-1 text-[12px] text-ink-faint">Species-first inventory with every aggregate traceable to the exact save records.</p>\n          </div>\n          <div className="text-right font-mono text-[10px] uppercase tracking-wider text-ink-faint">\n            <div><span className="text-amber">{groups.length}</span> species shown</div>\n            <div><span className="text-ink-dim">{visibleInstances}</span> / {scoped.length} Pals</div>\n          </div>'''
new = '''            <h1 className="mt-0.5 font-display text-xl font-bold tracking-wide text-ink">\n              {mode === "roster" ? "Roster Intelligence" : "Owned Pal Inventory"}\n            </h1>\n            <p className="mt-1 text-[12px] text-ink-faint">\n              {mode === "roster"\n                ? "Best owned options across your active roster, with every recommendation backed by visible role evidence."\n                : "Species-first inventory with every aggregate traceable to the exact save records."}\n            </p>\n          </div>\n          <div className="text-right font-mono text-[10px] uppercase tracking-wider text-ink-faint">\n            {mode === "roster" ? (\n              <>\n                <div><span className="text-amber">4</span> roster roles</div>\n                <div><span className="text-ink-dim">{scoped.length}</span> scoped Pals</div>\n              </>\n            ) : (\n              <>\n                <div><span className="text-amber">{groups.length}</span> species shown</div>\n                <div><span className="text-ink-dim">{visibleInstances}</span> / {scoped.length} Pals</div>\n              </>\n            )}\n          </div>'''
if old not in text:
    raise SystemExit("header block not found")
text = text.replace(old, new, 1)
path.write_text(text, encoding="utf-8")

# --- Add focused combat-coverage regression tests. ---
path = root / "app/src/views/pal-intelligence/roster-intelligence.test.ts"
text = path.read_text(encoding="utf-8")
old = '''  ["Musclehead", passive("Musclehead", 3, "ShotAttack", "Musclehead")],\n]);'''
new = '''  ["Musclehead", passive("Musclehead", 3, "ShotAttack", "Musclehead")],\n  ["Ferocious", passive("Ferocious", 3, "ShotAttack", "Ferocious")],\n  ["Legend", passive("Legend", 4, "MaxHP", "Legend")],\n  ["RunnerCombatish", passive("RunnerCombatish", 2, "MoveSpeed", "Runner")],\n]);'''
if old not in text:
    raise SystemExit("passive fixture anchor not found")
text = text.replace(old, new, 1)

anchor = '''  test("coverage calls out weak, thin, and healthy specialist depth explicitly", () => {'''
addition = '''  test("combat coverage requires purpose-built high-tier tuning instead of any combat-ish passive", () => {\n    const a = species("A");\n    const b = species("B");\n    const c = species("C");\n    const rows = new Map([[a.id, a], [b.id, b], [c.id, c]]);\n\n    const weakSummary = buildRosterIntelligence(\n      [\n        pal("A", { passives: ["Musclehead"] }),\n        pal("B", { passives: ["RunnerCombatish"] }),\n      ],\n      rows,\n      passives,\n    );\n    expect(role(weakSummary, "combat").coverage).toBe("weak");\n\n    const thinSummary = buildRosterIntelligence(\n      [\n        pal("A", { passives: ["Musclehead", "Ferocious"] }),\n        pal("B", { passives: ["Musclehead"] }),\n      ],\n      rows,\n      passives,\n    );\n    expect(role(thinSummary, "combat").coverage).toBe("thin");\n\n    const healthySummary = buildRosterIntelligence(\n      [\n        pal("A", { passives: ["Musclehead", "Ferocious"] }),\n        pal("B", { passives: ["Musclehead", "Legend"] }),\n        pal("C", { passives: ["Ferocious", "Legend"] }),\n      ],\n      rows,\n      passives,\n    );\n    expect(role(healthySummary, "combat").coverage).toBe("healthy");\n    expect(role(healthySummary, "combat").coverageReason).toContain("3 owned species");\n  });\n\n'''
if addition not in text:
    if anchor not in text:
        raise SystemExit("coverage test anchor not found")
    text = text.replace(anchor, addition + anchor, 1)
path.write_text(text, encoding="utf-8")

# --- Narrow changelog note for the refinement. ---
path = root / "CHANGELOG.md"
text = path.read_text(encoding="utf-8")
anchor = '- Roster Intelligence keeps one best instance per species so duplicate copies cannot crowd out role coverage, reuses existing combat/work passive evidence, and treats work suitability Lv3+ as explicit specialist coverage.\n'
addition = '- Refined Roster Intelligence UX with role-specific suitability badges and mode-aware headers; combat coverage now requires purpose-built high-tier tuning instead of treating any combat-ish passive as healthy roster depth.\n'
if addition not in text:
    if anchor not in text:
        raise SystemExit("changelog anchor not found")
    text = text.replace(anchor, anchor + addition, 1)
path.write_text(text, encoding="utf-8")
