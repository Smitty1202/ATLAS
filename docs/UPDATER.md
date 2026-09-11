# ATLAS signed self-updater

ATLAS uses Tauri's official v2 updater for stable Windows NSIS releases.
Installed builds check the static `latest.json` attached to the newest published
GitHub release, download the matching installer, verify its mandatory updater
signature, and install it in passive mode.

The updater signing key is **not** Windows Authenticode signing. It is ATLAS's
private trust key for in-app packages. Keep the private key permanently backed
up and never commit it. Losing it means already-installed updater-enabled builds
cannot trust future releases signed by a replacement key.

## One-time key setup

From PowerShell on a trusted development machine, use ATLAS's pinned Tauri CLI:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.tauri" | Out-Null
cd E:\Dev\ATLAS\app
bun run tauri signer generate -w "$env:USERPROFILE\.tauri\atlas-updater.key"
Get-ChildItem "$env:USERPROFILE\.tauri\atlas-updater*"
```

If the ATLAS checkout is not available, the package-qualified equivalent is:

```powershell
bunx @tauri-apps/cli signer generate -w "$env:USERPROFILE\.tauri\atlas-updater.key"
```

Do not use bare `bunx tauri` outside the project directory; Bun may resolve the
unrelated `tauri` package instead of `@tauri-apps/cli`.

Use Tauri CLI 2.10.1 or newer when generating the key. Tauri fixed an
empty-password key-generation bug in 2.10.1; keys produced by affected older CLI
versions should be regenerated.

Add these repository secrets under **Settings -> Secrets and variables ->
Actions**:

- `TAURI_SIGNING_PRIVATE_KEY` — the complete private key content (or a path only
  in a local build; GitHub Actions should use the content).
- `TAURI_UPDATER_PUBKEY` — the complete companion public key content.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — the key password, if one was set. It may
  be empty for an unencrypted private key stored securely as a GitHub secret.

Do not paste the private key into issues, pull requests, logs, source files, or
release notes.

## Release behavior

The release workflow runs only from a `vX.Y.Z` tag and refuses to build if the
tag does not match `app/src-tauri/tauri.conf.json`.

The workflow creates a temporary Tauri config on the Actions runner that:

1. embeds the updater public key and GitHub `latest.json` endpoint,
2. enables `createUpdaterArtifacts`,
3. keeps Windows installation in Tauri's recommended passive mode,
4. builds and signs the NSIS updater artifact,
5. creates `latest.json` with the installer URL and inline signature, and
6. attaches the installer, `.sig`, portable ZIP, and `latest.json` to a **draft**
   GitHub release.

Draft releases are not returned by GitHub's `releases/latest` route, so existing
ATLAS installations do not see the update while security checks are still being
performed. Continue the established release gate: hash the installer, scan the
exact artifact, download the exact GitHub artifact, verify its hash, apply
Mark-of-the-Web, scan that downloaded copy with Defender, then publish only when
clean. Publishing the draft is the action that makes the new `latest.json`
visible to installed ATLAS copies.

## Bootstrap proof completed

The updater chain was proven on 2026-09-10 using isolated signed builds
`0.4.1-bootstrap` and `0.4.2-bootstrap`. The older build discovered the fixed
prerelease manifest, downloaded the newer NSIS installer, verified its updater
signature, handed off installation, and relaunched as the newer build. The stable
GitHub `releases/latest` endpoint remained on v0.4.0 throughout the proof.

v0.4.0 predates the install-capable updater, so moving from v0.4.0 to v0.4.1
requires one final manual installer. Once v0.4.1 is installed, future stable
releases use **About -> Check for updates -> Download & install**.
