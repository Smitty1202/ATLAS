$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$path = Join-Path $root "CHANGELOG.md"
$utf8 = [System.Text.UTF8Encoding]::new($false)
$text = [System.IO.File]::ReadAllText($path)
$newline = if ($text.Contains("`r`n")) { "`r`n" } else { "`n" }
$bullet = '- Added species-level Pal Intelligence role picks for best combat copy, best worker copy, and separate male/female breeding-core candidates, with visible evidence and no hidden weighted score.'

# Remove every accidental copy first.
$escaped = [regex]::Escape($bullet)
$text = [regex]::Replace($text, "(?m)^$escaped\r?\n", "")

# Insert exactly once into the 0.5.0 Unreleased Added section.
$releaseMarker = '## [0.5.0] - Unreleased'
$releaseIndex = $text.IndexOf($releaseMarker)
if ($releaseIndex -lt 0) { throw "0.5.0 Unreleased section not found." }
$addedIndex = $text.IndexOf('### Added', $releaseIndex)
if ($addedIndex -lt 0) { throw "0.5.0 Added section not found." }
$lineEnd = $text.IndexOf($newline, $addedIndex)
if ($lineEnd -lt 0) { throw "Could not locate end of 0.5.0 Added heading." }
$insertAt = $lineEnd + $newline.Length
$text = $text.Insert($insertAt, $bullet + $newline)

$count = ([regex]::Matches($text, [regex]::Escape($bullet))).Count
if ($count -ne 1) { throw "Expected one Slice 3 changelog bullet, found $count." }

[System.IO.File]::WriteAllText($path, $text, $utf8)
