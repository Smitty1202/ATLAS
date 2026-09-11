# Changelog

Notable changes per release, newest first. Dates are ship dates unless a
version is marked Unreleased.

## [0.5.0] - Unreleased

### Added
- Added species-level Pal Intelligence role picks for best combat copy, best worker copy, and separate male/female breeding-core candidates, with visible evidence and no hidden weighted score. Worker picks prioritize direct productivity passives before SAN/hunger sustainability support.
- Added explainable Pal Intelligence Keep / Breeding Candidate / Redundant recommendations using conservative same-species dominance rules, with visible evidence instead of an opaque score.
- Added explicit passive rank/tier labels and per-Pal Condense X/4 labels so breeding value and condensation investment are readable at a glance.
- Added rich passive hover cards in Pal Intelligence with player-facing effect wording, descriptions, rank/tier details, and viewport-aware positioning.
- Added the first Pal Intelligence inventory workspace: species-first grouping over the authoritative owned-Pal save records, with search, location/special filters, duplicate counts, passive/location distributions, IV ranges, Alpha/Lucky/field-boss indicators, ownership context, and instance-level Pal-dex drill-down.
- Added focused selector tests for player/guild-base scoping, human exclusion, aggregation, filtering, searching, and sorting.
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
## [0.4.0] - 2026-09-10

### Added
- Added a read-only Progress dashboard with active-scope Pal species, map
  completion counters, and world/player/base/owned-Pal summary stats.
- Added lifetime Pal capture parsing from player `RecordData` so Progress
  counts captured species even after a Pal leaves the current roster.
- Added Pal Collection details to Progress, splitting lifetime species state
  into captured, discovered, and undiscovered lists with Pal-dex navigation.
- Added lifetime capture statistics to Progress, including total captures,
  top captured species, and capture counts in the captured collection list.
- Added Missing World Objectives to Progress with searchable unresolved map
  objectives and one-click focus on the matching World Map POI.

### Changed
- Objective map focus now reveals only the selected POI temporarily, without changing
  global map filters or spoiler visibility for neighboring pins.

## [0.3.0] - 2026-09-10

### Added
- Remembered map layer and viewport position/zoom.
- Persistent effigy-type filters with All/None and hide-found controls.
- 30-second map refresh plus refresh on focus/visibility.
- Current field-boss defeat tracking.

### Changed
- Map refresh keeps the last good state during transient save-read failures.
## [0.2.0] - 2026-09-09

### Changed

- Project derived from Pal Lab v1.10.1
  (`e21ec37f643e2ca913cbf2de4f5898bc5fef70d5`) as the ATLAS baseline.
- Rebranded the current application as Smitty's ATLAS.
- Established independent ATLAS versioning at 0.1.0.
- Updated Tauri/package identity for ATLAS.
- Migrated update checks to the public Smitty1202/ATLAS GitHub Releases
  endpoint.
- Parsed both legacy flat and modern typed Palworld effigy collection flags
  while retaining the existing flattened GUID list for map compatibility.
- Added developer tooling to discover modern world-placed effigy actors and
  their typed class metadata from current Palworld map packages.

The remaining entries below are inherited Pal Lab release history retained for
historical accuracy and upstream attribution.

## [1.10.1] - 2026-08-04

### Changed

- **SFTP errors now quote the server.** When a host closes the session, the
  error includes the server's own stated reason (e.g.
  `server said: "Too many logins for 'user'"`), naming the exact limit
  instead of a bare "disconnected".

## [1.10.0] - 2026-08-04

### Added

- **Remembered SFTP logins.** Opt-in "Remember password" on the connect form
  stores your password (or key passphrase) in the OS credential vault
  (Windows Credential Manager) - never a file, never plaintext. With it set,
  reopening Pal Lab reconnects to your server and loads your world
  automatically, exactly like local saves. Unticking the box scrubs the
  stored secret.

### Fixed

- **Reconnecting to a dedicated server after closing the app** no longer
  fails with "error opening ssh channel: disconnected". Pal Lab previously
  dropped the connection without an SSH goodbye, so hosts that cap concurrent
  SFTP sessions kept the old session as a zombie and refused the new one.
  Now: graceful disconnect on close/switch/exit, one automatic fresh-dial
  retry when a host is slow to reap, SSH keepalives for long-lived sessions,
  and a clearer message if the host still holds an old session.

## [1.9.0] - 2026-08-03

### Added
- **Captured humans are first-class.** Clicking a captured human (villager,
  merchant, syndicate thug, bounty target...) now opens a proper detail card -
  localized name, faction, level, HP/ATK/DEF, and base work suitabilities -
  instead of an "unknown pal" error. Data for all 401 human NPCs vendored from
  palworld-save-pal (credited in THIRD-PARTY-NOTICES).
- **Human portraits.** Real archetype art in the palbox, roster, and card:
  merchants, dealers, black marketeers, and unique portraits for all 34
  bounty targets (Hawk, Grill, Ego...). Bounty humans keep the Alpha badge,
  matching the game.
- **Roster polish.** Humans show their display name (not a raw id like
  `Male_People03`), IV cells show em-dashes instead of fake zeros, palbox
  search finds humans by name, and the header splits "N pals · M humans".

## [1.8.1] - 2026-08-03

### Fixed

- **SFTP world scan now handles hosting-provider layouts.** Game hosts often
  jail SFTP at a server root with the world buried at
  `/Pal/Saved/SaveGames/<id>/<world>` — deeper than the old 2-level scan, so
  connecting succeeded but no worlds were found. The scanner now searches up
  to 6 levels deep with a request budget (max 400 directory listings),
  prioritizing well-known folder names (`Pal`, `Saved`, `SaveGames`, steam
  ids, world GUIDs) and skipping noise (`backup`, `logs`, dotfolders).
  Pointing REMOTE PATH at `/` on a typical game host now just works.
- Clearer guidance when no worlds are found (names the common
  `/Pal/Saved/SaveGames` path).

## [1.8.0] - 2026-08-03

### Added
- **Dedicated servers over SFTP (desktop).** New _Dedicated server (SFTP)_
  button on the load screen: connect over SSH (password or key file), Pal Lab
  scans for worlds, loads yours live, and **polls every 60s** so the roster
  silently refreshes while you play — no more manual save-backup snapshots.
  Read-only: nothing is ever written to the server. Host fingerprints are
  pinned on first connect (changed fingerprint = hard refusal with both
  fingerprints shown); passwords live in memory for the session only, never
  on disk. Solver, IV Lab, Pal-dex, and world options all work on the live
  connection; reopening the app offers one-click reconnect.
- **Surgery table: implantable-passives list.** Optionally restrict which
  passives the solver may implant (same picker as Required passives). Leave
  empty to allow any implantable passive. When a plan is impossible because
  the allowlist excludes the missing passive, the no-path panel says exactly
  that.

### Changed

- Advanced-station time costs (surgery, gender reverser, skill fruits) now
  default to **30 seconds** — matching real-world use — instead of 300+.
  Still tunable per station.

## [1.7.0] - 2026-07-28

### Added
- **The solver now explains itself.** Plan steps carry a per-egg odds
  breakdown (Passives / Move / IVs / Gender → expected eggs) in the step list
  and node panel — no more mystery percentages on egg chips.
- **"Cleans line" annotation.** When a plan breeds an intermediate purely to
  shed unwanted passives from the line (a real technique — a child inherits
  from BOTH parents' combined passive pool, so a clean parent means more eggs
  hit the target), that node now says so, with a plain-English explanation in
  its panel.
- **Extra-passives tolerance control.** New "Extra passives" setting
  (Any / ≤2 / ≤1 / None) next to Required passives. Context-aware default:
  queries with no required passives default to **Any** — the solver will
  never silently add cleanup steps to a "just get me this species/move"
  request; queries with required passives default to ≤1. Your explicit
  choice persists.
- **More accurate move-inheritance odds.** Owned parents now use their real
  equipped inheritable moves for the inheritance pool instead of a species
  estimate (still labeled as an estimate — the ~50% base rate remains
  community-measured).

### Changed

- Move-only solves that previously returned multi-step "passive laundering"
  plans by default now return the fastest direct path (set Extra passives to
  ≤1/None to get the old behavior deliberately).

## [1.6.0] - 2026-07-28

### Added
- **Xbox / Game Pass saves, built in.** The Windows Gaming Services (WGS)
  container store is parsed directly on desktop, and CNK saves decode natively.

## [1.5.0] - 2026-07-27

### Added
- **Attack-skill inheritance solving** and Skill Fruit planning.

## [1.4.1] - 2026-07-27

### Added
- **Surgery table + gender reverser as solver cost options.**
