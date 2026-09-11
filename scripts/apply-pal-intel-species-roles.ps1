$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$viewPath = Join-Path $root "app/src/views/PalIntelligence.tsx"
$changelogPath = Join-Path $root "CHANGELOG.md"
$utf8 = [System.Text.UTF8Encoding]::new($false)

$view = [System.IO.File]::ReadAllText($viewPath)
$importLine = 'import { SpeciesRoleSummary } from "./pal-intelligence/species-role-summary";'
if (-not $view.Contains($importLine)) {
    $anchor = 'import { hexGuid } from "../components/palbox/selectors";'
    if (-not $view.Contains($anchor)) {
        throw "Could not find Pal Intelligence import anchor."
    }
    $view = $view.Replace($anchor, "$importLine`r`n$anchor")
}

if (-not $view.Contains('<SpeciesRoleSummary')) {
    $anchor = '              <div className="flex items-center justify-between gap-3 border-b border-line bg-raised/30 px-5 py-2">'
    if (-not $view.Contains($anchor)) {
        throw "Could not find individual-instance header anchor."
    }
    $block = @'
              <SpeciesRoleSummary
                peers={selected.instances}
                passiveRows={passiveRows}
                onOpenPal={(pal) => requestDex(selected.species_id, hexGuid(pal.instance_id))}
              />

'@
    $view = $view.Replace($anchor, $block + $anchor)
}
[System.IO.File]::WriteAllText($viewPath, $view, $utf8)

$changelog = [System.IO.File]::ReadAllText($changelogPath)
$bullet = '- Added species-level Pal Intelligence role picks for best combat copy, best worker copy, and separate male/female breeding-core candidates, with visible evidence and no hidden weighted score.'
if (-not $changelog.Contains($bullet)) {
    $pattern = '(?m)^(### Added\r?\n)'
    if (-not [regex]::IsMatch($changelog, $pattern)) {
        throw "Could not find changelog Added section."
    }
    $changelog = [regex]::Replace($changelog, $pattern, "`$1$bullet`r`n", 1)
}
[System.IO.File]::WriteAllText($changelogPath, $changelog, $utf8)
