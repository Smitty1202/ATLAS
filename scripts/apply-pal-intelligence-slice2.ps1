$ErrorActionPreference = "Stop"

function Replace-Exact([string]$Text, [string]$Old, [string]$New, [string]$Label) {
    if (-not $Text.Contains($Old)) {
        throw "Replacement anchor not found: $Label"
    }
    return $Text.Replace($Old, $New)
}

$path = "app/src/views/PalIntelligence.tsx"
$text = Get-Content $path -Raw
$text = $text.Replace("`r`n", "`n")

$text = Replace-Exact $text 'import { PassiveStrip } from "../components/passive-strip";' @'
import {
  CondenseBadge,
  IntelPassiveStrip,
  RecommendationSummary,
} from "./pal-intelligence/instance-intel";
'@ "instance intel import"

$instancePattern = 'function InstanceRow\(\{\s*pal,\s*ownerLabel,\s*onOpenDex,\s*\}: \{\s*pal: OwnedPal;\s*ownerLabel: string;\s*onOpenDex: \(\) => void;\s*\}\) \{'
$instanceReplacement = @'
function InstanceRow({
  pal,
  peers,
  passiveRows,
  ownerLabel,
  onOpenDex,
}: {
  pal: OwnedPal;
  peers: OwnedPal[];
  passiveRows: ReadonlyMap<string, PassiveEntry>;
  ownerLabel: string;
  onOpenDex: () => void;
}) {
'@
$updated = [regex]::Replace($text, $instancePattern, $instanceReplacement, 1)
if ($updated -eq $text) { throw "Replacement anchor not found: InstanceRow props" }
$text = $updated

$ivRow = '          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-ink-faint">'
$ivRowReplacement = @'
          <RecommendationSummary pal={pal} peers={peers} passiveRows={passiveRows} />
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-ink-faint">
            <CondenseBadge rank={pal.rank} />
'@
$text = Replace-Exact $text $ivRow $ivRowReplacement "recommendation and condense row"

$passiveLine = '                <PassiveStrip key={`${passive}-${index}`} id={passive} size="sm" />'
$passiveReplacement = @'
                <IntelPassiveStrip
                  key={`${passive}-${index}`}
                  id={passive}
                  passiveRows={passiveRows}
                />
'@
$text = Replace-Exact $text $passiveLine $passiveReplacement "ranked passive strip"

$stateLine = '  const [passiveNames, setPassiveNames] = useState<Map<string, string>>(new Map());'
$stateReplacement = @'
  const [passiveNames, setPassiveNames] = useState<Map<string, string>>(new Map());
  const [passiveRows, setPassiveRows] = useState<Map<string, PassiveEntry>>(new Map());
'@
$text = Replace-Exact $text $stateLine $stateReplacement "passive row state"

$loadLine = '      .then((rows) => setPassiveNames(new Map(rows.map((row) => [row.id, row.name]))))'
$loadReplacement = @'
      .then((rows) => {
        setPassiveNames(new Map(rows.map((row) => [row.id, row.name])));
        setPassiveRows(new Map(rows.map((row) => [row.id, row])));
      })
'@
$text = Replace-Exact $text $loadLine $loadReplacement "passive row loading"

$palCallLine = '                    pal={pal}'
$palCallReplacement = @'
                    pal={pal}
                    peers={selected.instances}
                    passiveRows={passiveRows}
'@
$text = Replace-Exact $text $palCallLine $palCallReplacement "InstanceRow call"

Set-Content $path -Value $text -NoNewline -Encoding utf8

$changelogPath = "CHANGELOG.md"
$changelog = Get-Content $changelogPath -Raw
$changelog = $changelog.Replace("`r`n", "`n")
$anchor = "### Added`n- Added the first Pal Intelligence inventory workspace:"
$replacement = "### Added`n- Added explainable Pal Intelligence Keep / Breeding Candidate / Redundant recommendations using conservative same-species dominance rules, with visible evidence instead of an opaque score.`n- Added explicit passive rank/tier labels and per-Pal Condense X/4 labels so breeding value and condensation investment are readable at a glance.`n- Added the first Pal Intelligence inventory workspace:"
if (-not $changelog.Contains($anchor)) { throw "CHANGELOG anchor not found" }
$changelog = $changelog.Replace($anchor, $replacement)
Set-Content $changelogPath -Value $changelog -NoNewline -Encoding utf8

Write-Host "Pal Intelligence Slice 2 integration applied."
