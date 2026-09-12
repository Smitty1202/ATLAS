from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"expected block not found in {path}: {old[:80]!r}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


# Reuse the exact combat / worker-passive evidence already owned by Species Intelligence.
replace_once(
    "app/src/views/pal-intelligence/species-roles.ts",
    "function isWorkSustainabilityPassive(row: PassiveEntry): boolean {\n  return row.rank > 0 && row.effects.some((effect) => WORK_SUSTAINABILITY_EFFECTS.has(effect.type));\n}\n\nfunction relevantRows(\n",
    "function isWorkSustainabilityPassive(row: PassiveEntry): boolean {\n  return row.rank > 0 && row.effects.some((effect) => WORK_SUSTAINABILITY_EFFECTS.has(effect.type));\n}\n\nexport function combatPassiveRows(\n  pal: OwnedPal,\n  passiveRows: ReadonlyMap<string, PassiveEntry>,\n): PassiveEntry[] {\n  return relevantRows(pal, passiveRows, isCombatPassive);\n}\n\nexport function workProductivityPassiveRows(\n  pal: OwnedPal,\n  passiveRows: ReadonlyMap<string, PassiveEntry>,\n): PassiveEntry[] {\n  return relevantRows(pal, passiveRows, isWorkProductivityPassive);\n}\n\nfunction relevantRows(\n",
)

# Pal Intelligence gets a lightweight Inventory / Roster mode switch. The existing
# inventory DOM stays intact; roster mode simply hides it and mounts the new panel.
replace_once(
    "app/src/views/PalIntelligence.tsx",
    'import { CondensationSummaryPanel } from "./pal-intelligence/condensation-summary";\n',
    'import { CondensationSummaryPanel } from "./pal-intelligence/condensation-summary";\nimport { RosterIntelligencePanel } from "./pal-intelligence/roster-intelligence-panel";\n',
)
replace_once(
    "app/src/views/PalIntelligence.tsx",
    '  const [showAllPassives, setShowAllPassives] = useState(false);\n',
    '  const [showAllPassives, setShowAllPassives] = useState(false);\n  const [mode, setMode] = useState<"inventory" | "roster">("inventory");\n',
)
replace_once(
    "app/src/views/PalIntelligence.tsx",
    '      </header>\n\n      <div className="grid shrink-0 grid-cols-[minmax(240px,1.5fr)_repeat(3,minmax(145px,0.6fr))] gap-2 border-b border-line bg-panel/40 px-6 py-3">\n',
    '''      </header>\n\n      <div className="flex shrink-0 gap-2 border-b border-line bg-panel/30 px-6 py-2.5">\n        <button\n          type="button"\n          onClick={() => setMode("inventory")}\n          className={`rounded-md border px-3 py-1.5 text-[11px] font-medium transition-colors ${\n            mode === "inventory"\n              ? "border-amber/40 bg-amber/10 text-amber"\n              : "border-line bg-raised text-ink-faint hover:border-amber/30 hover:text-ink"\n          }`}\n        >\n          Inventory\n        </button>\n        <button\n          type="button"\n          onClick={() => setMode("roster")}\n          className={`rounded-md border px-3 py-1.5 text-[11px] font-medium transition-colors ${\n            mode === "roster"\n              ? "border-amber/40 bg-amber/10 text-amber"\n              : "border-line bg-raised text-ink-faint hover:border-amber/30 hover:text-ink"\n          }`}\n        >\n          Roster Intelligence\n        </button>\n      </div>\n\n      <div className={`${mode === "roster" ? "hidden " : ""}grid shrink-0 grid-cols-[minmax(240px,1.5fr)_repeat(3,minmax(145px,0.6fr))] gap-2 border-b border-line bg-panel/40 px-6 py-3`}>\n''',
)
replace_once(
    "app/src/views/PalIntelligence.tsx",
    '      {saveError && <div className="shrink-0 border-b border-bad/30 bg-bad/10 px-6 py-2 text-[11px] text-bad">{saveError}</div>}\n\n      <div className="grid min-h-0 flex-1 grid-cols-[minmax(330px,0.9fr)_minmax(0,1.55fr)]">\n',
    '''      {saveError && <div className="shrink-0 border-b border-bad/30 bg-bad/10 px-6 py-2 text-[11px] text-bad">{saveError}</div>}\n\n      {mode === "roster" && (\n        <RosterIntelligencePanel\n          pals={scoped}\n          passiveRows={passiveRows}\n          onInspectSpecies={(speciesId) => {\n            setSearch("");\n            setLocation("all");\n            setSpecial("all");\n            setSelectedSpecies(speciesId);\n            setMode("inventory");\n          }}\n        />\n      )}\n\n      <div className={`${mode === "roster" ? "hidden " : ""}grid min-h-0 flex-1 grid-cols-[minmax(330px,0.9fr)_minmax(0,1.55fr)]`}>\n''',
)

# Add the slice to the existing 0.6.0 Unreleased changelog without touching history.
replace_once(
    "CHANGELOG.md",
    "### Added\n",
    "### Added\n- Added cross-species Roster Intelligence for Mining, Lumbering, Transporting, and Combat, with deterministic top owned picks, visible ranking evidence, specialist-depth warnings, and one-click drill-down into Species Intelligence.\n- Roster Intelligence keeps one best instance per species so duplicate copies cannot crowd out role coverage, reuses existing combat/work passive evidence, and treats work suitability Lv3+ as explicit specialist coverage.\n",
)
