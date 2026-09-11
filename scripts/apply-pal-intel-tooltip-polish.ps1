$ErrorActionPreference = "Stop"

function Replace-Required([string]$Text, [string]$Old, [string]$New, [string]$Label) {
    if (-not $Text.Contains($Old)) {
        throw "Replacement anchor not found: $Label"
    }
    return $Text.Replace($Old, $New)
}

$intelPath = "app/src/views/pal-intelligence/instance-intel.tsx"
$intel = Get-Content $intelPath -Raw
$intel = Replace-Required $intel "const TOOLTIP_WIDTH = 360;" "const TOOLTIP_WIDTH = 408;" "tooltip width constant"
$intel = Replace-Required $intel 'w-[360px] max-w-[calc(100vw-24px)]' 'w-[408px] max-w-[calc(100vw-24px)]' "tooltip width class"
Set-Content $intelPath -Value $intel -NoNewline -Encoding utf8

$uiPath = "app/src/lib/ui.ts"
$ui = Get-Content $uiPath -Raw
$ui = Replace-Required $ui 'Sanity_Decrease: "SAN Loss",' 'Sanity_Decrease: "SAN Depletion Rate",' "SAN effect label"
$ui = Replace-Required $ui 'FullStomatch_Decrease: "Hunger Loss",' 'FullStomatch_Decrease: "Hunger Depletion Rate",' "hunger effect label"
Set-Content $uiPath -Value $ui -NoNewline -Encoding utf8

$changelogPath = "CHANGELOG.md"
$changelog = Get-Content $changelogPath -Raw
$anchor = "- Added explicit passive rank/tier labels and per-Pal Condense X/4 labels so breeding value and condensation investment are readable at a glance."
$replacement = "$anchor`n- Added rich passive hover cards in Pal Intelligence with player-facing effect wording, descriptions, rank/tier details, and viewport-aware positioning."
$changelog = Replace-Required $changelog $anchor $replacement "0.5.0 tooltip changelog"
Set-Content $changelogPath -Value $changelog -NoNewline -Encoding utf8

Write-Host "Final Pal Intelligence tooltip polish applied."
