$ErrorActionPreference = "Stop"

function Replace-Required([string]$Path, [string]$Old, [string]$New) {
    $text = [System.IO.File]::ReadAllText($Path)
    if (-not $text.Contains($Old)) {
        throw "Expected text not found in ${Path}: $Old"
    }
    [System.IO.File]::WriteAllText($Path, $text.Replace($Old, $New))
}

Replace-Required "app/package.json" '"version": "0.4.0"' '"version": "0.4.1"'
Replace-Required "app/src-tauri/tauri.conf.json" '"version": "0.4.0"' '"version": "0.4.1"'
Replace-Required "app/src-tauri/Cargo.toml" 'version = "0.4.0"' 'version = "0.4.1"'

$lockPath = "app/src-tauri/Cargo.lock"
$lock = [System.IO.File]::ReadAllText($lockPath)
$atlasBlock = "name = `"atlas`"`r`nversion = `"0.4.0`""
if (-not $lock.Contains($atlasBlock)) {
    $atlasBlock = "name = `"atlas`"`nversion = `"0.4.0`""
}
if (-not $lock.Contains($atlasBlock)) {
    throw "ATLAS 0.4.0 root package entry not found in Cargo.lock"
}
[System.IO.File]::WriteAllText(
    $lockPath,
    $lock.Replace($atlasBlock, ($atlasBlock -replace '0\.4\.0','0.4.1'))
)

$changelogPath = "CHANGELOG.md"
$changelog = [System.IO.File]::ReadAllText($changelogPath)
$marker = "## [0.4.0] - 2026-09-10"
if (-not $changelog.Contains($marker)) {
    throw "0.4.0 changelog marker not found"
}
$entry = @'
## [0.4.1] - 2026-09-10

### Added
- Added signed in-app self-updating for installed Windows builds using Tauri's official updater and NSIS packages.
- Added About-panel update download/install controls with release notes, progress reporting, retry handling, and automatic handoff to the passive Windows installer.
- Added mandatory updater-package signature verification using ATLAS's permanent updater signing key.

### Changed
- Hardened the release workflow to generate signed updater artifacts, `latest.json`, installer signatures, and draft releases that remain invisible to installed clients until the existing security gate passes.
- Release builds now use the frozen Bun lockfile for reproducible packaging.

### Verified
- Proved the complete updater chain with an isolated `0.4.1-bootstrap` -> `0.4.2-bootstrap` upgrade before shipping the stable updater path.

'@
[System.IO.File]::WriteAllText($changelogPath, $changelog.Replace($marker, $entry + $marker))

$updaterDocPath = "docs/UPDATER.md"
$updaterDoc = [System.IO.File]::ReadAllText($updaterDocPath)
$bootstrapHeading = "## Bootstrap test"
$bootstrapIndex = $updaterDoc.IndexOf($bootstrapHeading)
if ($bootstrapIndex -lt 0) {
    throw "Bootstrap test section not found in docs/UPDATER.md"
}
$completed = @'
## Bootstrap proof completed

The updater chain was proven on 2026-09-10 using isolated signed builds
`0.4.1-bootstrap` and `0.4.2-bootstrap`. The older build discovered the fixed
prerelease manifest, downloaded the newer NSIS installer, verified its updater
signature, handed off installation, and relaunched as the newer build. The stable
GitHub `releases/latest` endpoint remained on v0.4.0 throughout the proof.

v0.4.0 predates the install-capable updater, so moving from v0.4.0 to v0.4.1
requires one final manual installer. Once v0.4.1 is installed, future stable
releases use **About -> Check for updates -> Download & install**.
'@
[System.IO.File]::WriteAllText(
    $updaterDocPath,
    $updaterDoc.Substring(0, $bootstrapIndex) + $completed + "`r`n"
)
