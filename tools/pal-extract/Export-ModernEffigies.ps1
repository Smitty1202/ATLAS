param(
    [string]$InputPath = (Join-Path $PSScriptRoot "..\..\testdata\probe\effigies.json"),
    [string]$OutputDir = (Join-Path $PSScriptRoot "..\..\app\public\map\effigies-modern"),
    [int]$ChunkCount = 6
)

$ErrorActionPreference = "Stop"
$data = Get-Content -LiteralPath $InputPath -Raw | ConvertFrom-Json
$modern = @($data.effigies | Where-Object { $null -ne $_.type })

if ($modern.Count -ne $data.newer_or_nonlegacy_candidate_count) {
    throw "Typed effigy count mismatch: report=$($data.newer_or_nonlegacy_candidate_count), typed=$($modern.Count)"
}

$guids = @($modern.guid)
if (($guids | Sort-Object -Unique).Count -ne $guids.Count) {
    throw "Duplicate modern effigy GUIDs found"
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
Get-ChildItem -LiteralPath $OutputDir -Filter "*.json" -ErrorAction SilentlyContinue | Remove-Item -Force

$size = [Math]::Ceiling($modern.Count / [double]$ChunkCount)
$chunkFiles = @()
for ($i = 0; $i -lt $ChunkCount; $i++) {
    $start = $i * $size
    if ($start -ge $modern.Count) { break }
    $end = [Math]::Min($start + $size - 1, $modern.Count - 1)
    $chunk = @($modern[$start..$end] | ForEach-Object {
        [ordered]@{
            x = $_.x
            y = $_.y
            z = $_.z
            map = $_.world
            guid = $_.guid
            type = $_.type
            class = $_.class
        }
    })
    $name = "$i.json"
    $chunk | ConvertTo-Json -Compress -Depth 4 | Set-Content -LiteralPath (Join-Path $OutputDir $name) -Encoding utf8NoBOM
    $chunkFiles += "/map/effigies-modern/$name"
}

$manifest = [ordered]@{
    game_build = [string]$data.game_build
    source = "testdata/probe/effigies.json"
    total = $modern.Count
    chunks = $chunkFiles
}
$manifest | ConvertTo-Json -Compress | Set-Content -LiteralPath (Join-Path $OutputDir "manifest.json") -Encoding utf8NoBOM

Write-Host "Wrote $($modern.Count) modern effigies for build $($data.game_build) to $OutputDir"
