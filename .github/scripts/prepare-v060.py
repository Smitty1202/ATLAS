from pathlib import Path
import json
import re

VERSION = "0.6.0"
DATE = "2026-09-12"

# package.json
package_path = Path("app/package.json")
package = json.loads(package_path.read_text(encoding="utf-8"))
assert package["version"] == "0.5.0", package["version"]
package["version"] = VERSION
package_path.write_text(json.dumps(package, indent=2) + "\n", encoding="utf-8")

# tauri.conf.json
tauri_path = Path("app/src-tauri/tauri.conf.json")
tauri = json.loads(tauri_path.read_text(encoding="utf-8"))
assert tauri["version"] == "0.5.0", tauri["version"]
tauri["version"] = VERSION
tauri_path.write_text(json.dumps(tauri, indent=2) + "\n", encoding="utf-8")

# Cargo.toml — only the desktop package version, not dependency versions.
cargo_path = Path("app/src-tauri/Cargo.toml")
cargo = cargo_path.read_text(encoding="utf-8")
old = 'version = "0.5.0"'
assert cargo.count(old) >= 1
cargo = cargo.replace(old, f'version = "{VERSION}"', 1)
cargo_path.write_text(cargo, encoding="utf-8")

# Finalize 0.6.0 and fold the never-shipped 0.5.1 fixes into it.
changelog_path = Path("CHANGELOG.md")
changelog = changelog_path.read_text(encoding="utf-8")
heading = "## [0.6.0] - Unreleased"
assert changelog.count(heading) == 1
changelog = changelog.replace(heading, f"## [0.6.0] - {DATE}", 1)
phantom = "\n## [0.5.1] - Unreleased\n\n### Fixed\n"
assert changelog.count(phantom) == 1
changelog = changelog.replace(phantom, "\n### Fixed\n", 1)
changelog_path.write_text(changelog, encoding="utf-8")

# Sanity checks before the build updates Cargo.lock.
assert "## [0.5.1] - Unreleased" not in changelog
assert f"## [0.6.0] - {DATE}" in changelog
print("Prepared ATLAS v0.6.0 release metadata and changelog.")
