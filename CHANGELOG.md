# Changelog

Notable changes per release, newest first. Dates are ship dates unless a
version is marked Unreleased.

## [0.6.0] - 2026-09-12

### Added
- Added cross-species Roster Intelligence for Mining, Lumbering, Transporting, and Combat, with deterministic top owned picks, visible ranking evidence, specialist-depth warnings, and one-click drill-down into Species Intelligence.
- Roster Intelligence keeps one best instance per species so duplicate copies cannot crowd out role coverage, reuses existing combat/work passive evidence, and treats work suitability Lv3+ as explicit specialist coverage.
- Refined Roster Intelligence UX with role-specific suitability badges and mode-aware headers; combat coverage now requires purpose-built high-tier tuning instead of treating any combat-ish passive as healthy roster depth.
- Added roster-level Condensation Intelligence with recommended combat/worker targets plus Safe to Condense, Likely Fodder, Protected Core, and Needs Review groups backed by visible same-species evidence.
- Condensation Intelligence now builds a small keeper core first: role picks, breeding core, special/invested copies, Rank 3+ / Rainbow / World Tree passive coverage, and species-best IV coverage are preserved without protecting every duplicate carrier.
- Safe material may preserve evidence across multiple keeper-core Pals instead of requiring one single all-dominating comparator; lower-tier passive or equipped-move tradeoffs are surfaced as Likely Fodder, while unknown metadata stays in Needs Review.
- Added typed Pal Intelligence handoffs into Solver and IV Lab so selected species and owned-instance context carry across tools without duplicating breeding or IV-planning logic.
- Best combat/worker role cards can prefill Solver with only the role-relevant passives already justified by visible Pal Intelligence evidence.
- IV Lab handoffs carry species-best owned IVs as an explicit suggestion; IV floors stay unchanged until the user chooses `Use floors`.

### Fixed
- World Map now combines SFTP dedicated-server Level/Players data with the matching local client `LocalData.sav`, restoring player positions, bases, and fog of war for remote worlds.
- Added Palworld 1.0 guild-marker decoding from `Level.sav` `GroupSaveDataMap`, so shared guild markers render for local and dedicated-server worlds while legacy LocalData pins remain supported.
- Added a per-save LocalData override in the Map filter so users can manually select/clear the client map-data file when automatic world-folder matching is ambiguous or unavailable.
- Hardened custom map-marker decoding with a targeted LocalData marker scan for current Palworld saves where fog parses but the generic GVAS struct-array decoder yields zero pins.

## [0.5.0] - 2026-09-11

### Added
- Added species-level Pal Intelligence role picks for best combat copy, best worker copy, and separate male/female breeding-core candidates, with visible evidence and no hidden weighted score.
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

- **Xbox / Game Pass saves, built in.** Pal Lab now reads the Windows Gaming
  Services (WGS) container store directly — no more converting with an
  external tool first.
  - **Desktop:** an _Xbox / Game Pass_ button on the load screen auto-detects
    the Game Pass save store (`%LOCALAPPDATA%\Packages\PocketpairInc.Palworld_…`),
    lists your worlds (name, players, last played), and loads the one you pick
    — one world loads immediately. Read-only: nothing is written, ever. The
    loaded world behaves like any other save (Solver, IV Lab, Pal-dex, plan
    links), is remembered across restarts, and re-imports fresh on boot.
  - **Web:** drop the `wgs` store folder onto pal-lab.pages.dev and it's
    detected automatically — same parsing, run in WebAssembly, still 100%
    client-side. Snapshot remembrance ("Restore") works for Xbox worlds too.
  - **CNK support:** the chunked Xbox `.sav` compression variant is decoded
    natively everywhere (it's a 12-byte wrapper over the standard zlib
    payload).
  - Format implemented from the layouts documented by palworld-save-pal,
    palworld-save-tools, and XGP-save-extractor (all MIT; nothing vendored —
    see THIRD-PARTY-NOTICES).

### Changed

- Dropping/pointing at a CNK save now just loads it; the old "convert with
  palworld-save-pal first" guidance is gone from the app and README.
- Live save-watching is disabled for Xbox saves (the WGS store has no stable
  folder to watch); reload by reopening the world from the load screen.

### Known limitations

- World Map fog-of-war is unavailable for Xbox saves this release.
- Xbox _console_ saves must sync to the PC Game Pass app once before Pal Lab
  can see them.

## [1.5.0] - 2026-07-27

### Added

- **Attack-skill inheritance solving** — the first tool anywhere to plan for
  active skills. Add **Required moves** to a solver target and Pal Lab plans
  breeding paths that carry the move from a pal you own: it reads which pals
  have the move _equipped_ (the post-1.0 rule — inherited skills come from the
  parents' equipped slots, per the official 1.0 patch notes), prices the
  inheritance roll into every egg estimate (~50%/egg, community-measured — and
  labeled as such), and threads the move through intermediate breeding steps
  (`INHERIT` chips on the plan tree). Moves the target species learns by
  level-up are auto-satisfied and say so. Per-move `IgnoreRandomInherit`
  eligibility is datamined (species-exclusive moves are correctly refused).
- **Skill Fruits as a solver cost option.** A required move nobody carries can
  be taught post-hatch when a Skill Fruit exists for it — toggle it under
  Advanced stations with your own time cost, and extra required moves beyond
  the one-inherit-per-line cap become `FRUIT` steps on the final pal.
- **Pal-dex move flags** — every active skill now shows INHERIT / FRUIT chips.
- **Shareable plan links.** _Copy link_ (next to Copy code) wraps a plan code
  in a URL; opening it boots straight into the Solver and re-solves the plan
  against _your_ save. The code rides the `#` fragment, so it never reaches
  server logs. Desktop copies link to the web app.
- **Pal Lab is now an installable PWA.** The web app registers a service
  worker (hand-rolled, dependency-free): instant repeat loads, offline app
  shell, and Install-to-desktop/home-screen from the browser menu.

### Fixed

- A shared plan link opened on a fresh boot now routes to the Solver
  automatically once the save loads (previously the import waited until you
  happened to open the Solver view).

## [1.4.1] - 2026-07-27

### Added

- **Surgery table + gender reverser as solver cost options.** The solver can
  now relax the terminal breeding step by implanting missing required passives
  (Surgery table) or flipping a parent's gender (gender reverser), each priced
  as an effort cost. Exact plans still win ties, and special lottery-tier
  passives (World-Tree, Rainbow) are correctly refused — the engine and the
  no-path diagnosis both know they can't be implanted, so you never get a dead
  remedy.
- **Honest Mutations card.** A reference card documenting what's actually known
  about breeding mutations: roughly ~1% per egg (code-verified), and that the
  outcome pools are _not_ publicly decoded. No invented odds.
- **Web save remembrance.** The browser app now remembers your save across
  visits in two tiers: a live folder handle (Chromium) for a one-gesture
  reload, and a universal IndexedDB byte snapshot that gives a one-click
  **Restore** in _every_ browser — including Firefox, Safari, and Brave — with
  no prompt at all.
- **Classic-dialog escape hatch (web).** When File System Access is available
  but Chrome refuses the folder, the dropzone offers the blocklist-free
  `<input webkitdirectory>` chooser.

### Changed

- **Web save parity.** The browser solver gained both new cost options, at full
  parity with desktop (verified live: a 0-step implant plan beats a 44h exact
  chain on test data).
- **Dropzone hint names the real save path** — "usually at
  `AppData\Local\Pal\Saved\SaveGames`" — instead of only describing the folder.
- The picker remembers your last-picked location per origin.

### Fixed

- **Chromium AppData blocklist handling.** Chromium's File System Access
  blocklist refuses handles anywhere under `AppData` (where Palworld saves
  actually live) for both the picker and drag-drop. A blocklisted drop now
  degrades gracefully to "no live handle" and still loads the bytes and stores
  a snapshot, instead of failing the load outright.
- **Detached-ArrayBuffer snapshot race (web).** The IndexedDB snapshot is now
  written _before_ the save buffers are transferred to the worker (which
  detaches them), fixing a silent `DataCloneError` that dropped remembrance.

## [1.4.0] - 2026-07-27

### Added

- **Pal-dex PARTNER tab** — all 299 partner skills with per-rank values, search,
  and species cross-links.
- **Passive multi-select filter parity on Palbox** — the shared passive picker
  (AND semantics) is now available in the Palbox inspector, matching Solver and
  IV Lab.

### Fixed

- **Condensation-rank off-by-one.** Fixed at the parser source: save Rank is
  1-based and was read as 0-based stars, so booster and star displays were off
  by one (a 1-star Grintale showed a 60% egg boost instead of the correct 55%).
  Verified against a live save.
- Fixed the `build:wasm` output directory so local web builds no longer bundle a
  stale wasm package (the rank fix had briefly shipped desktop-only).

## [1.3.0] - 2026-07-27

### Added

- **Pal Lab on the web.** A new `pal-web` wasm crate mirrors every desktop
  command through a Web Worker, so the full solver runs in the browser.
- **Drag-drop / picker save loading**, parsed 100% client-side — your save
  never leaves your device.
- **Deployed to [pal-lab.pages.dev](https://pal-lab.pages.dev)** via Cloudflare
  Pages.

### Changed

- Single-source app version (from `package.json`); the sidebar chip now shows
  the live version on both platforms instead of a hardcoded `v1.0`.
- Favicon and meta-description polish (app-icon favicon replaces the Vite
  default).

## [1.2.0] - 2026-07-27

### Added

- **Saved-plan tracking.** Saved plans auto-check their steps as you breed
  in-game (via the save watcher): node status badges, a progress percentage,
  and stale-parent warnings.
- **Pal-dex collection mode.** Every species is annotated owned /
  breedable-in-k-steps / catch-only, with a **Breed missing** button that chains
  the reachable ones into the breeding queue.
- **Dex reachability** — a breeding-graph BFS computes the minimum number of
  steps to reach each species from the pals you own.

### Changed

- **Whole repo relicensed to MIT.** The vendored GPL-3 C++ `ooz` decompressor
  was swapped for the pure-Rust MIT [oozextract](https://github.com/lvlvllvlvllvlvl/oozextract);
  GPL-3 was the only thing forcing the previous license. Verified byte-identical
  against the C++ path across all 157 compressed files in the reference corpus.

### Fixed

- Fixed a pre-existing Solver render loop that could spin with no save loaded.

## [1.1.0] - 2026-07-26

### Added

- **No-path diagnostics.** When the solver finds no plan, it now explains _why_
  — no owned carrier for a required passive, target species unreachable, step
  cap too low, gender bottleneck — instead of a bare "no line found". Shared by
  both Solver and IV Lab via one panel.
- **Solve persistence + history.** Results survive view switches, and the last
  20 successful solves are saved with one-click restore (Solver and IV Lab keep
  independent histories).
- **Bred-node hover cards.** Bred plan nodes show what the child must carry
  (required passives, random slots, gender, IV floors) and annotate same-species
  gender-flip steps.

### Fixed

- **Solver out-of-memory crash.** A heavy IV solve (e.g. Ragnahawk 100/100/100
  with three passives) could balloon to 11 GB+ and get OOM-killed. Bounded
  memory (per-chunk reduction), step-budget reachability pruning, and a search
  time budget bring the same case to ~107 MB peak / ~17s, returning best-so-far
  with a truncation note when the budget is hit.

## [1.0.0] - 2026-07-25

Initial release. A save-aware Palworld breeding planner for Windows (Tauri
desktop).

### Added

- **Breeding solver** that reads your actual save and computes optimal breeding
  paths from the pals you own (working-set DP), with a probability model
  validated against palcalc's numeric test oracles.
- **Solver views** — plan graph and list, PNG export, shareable plan codes,
  solve history, and a multi-target breeding queue.
- **Save inspector** — party, palbox, dimensional storage, global storage, and
  cages.
- **IV Lab** — inspect and breed toward individual-value thresholds.
- **Pal-dex** — full species reference (stats, passives, partner skills,
  reverse/forward breeding).
- **World map** — fog-of-war reconstructed from your save, plus fast-travel
  points, effigies, alphas, bounties, towers, bases, and spawn search.
- **Breeding setup** — boosters, cakes, lab research, and egg-hatch time folded
  into the effort math.
- **Read-only guarantee** — Pal Lab never writes Palworld save files.

### Note

- Initially released under GPL-3.0 at the repo root, forced solely by the
  vendored C++ `ooz` decompressor. Relicensed to MIT in 1.2.0 (see above).

