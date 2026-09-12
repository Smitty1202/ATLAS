//! `get_map_state` command: the save-side half of the MAP feature.
//!
//! Combines three sources into one [`MapState`]:
//!  - the client `LocalData.sav` -> world-map fog (per layer, as an 8-bit
//!    grayscale PNG where 255 = revealed, 0 = fogged) + player custom markers,
//!  - each player `.sav` -> last-known world position + `RecordData` unlock
//!    flags (fast-travel, effigies, defeated bosses, discovered areas),
//!  - `Level.sav` -> player nicknames + base camps.
//!
//! For a folder save, Level/Players are read from disk. For an SFTP sentinel,
//! those same bytes come from the existing SFTP bundle/cache while LocalData
//! remains client-side: explicit override first, then local auto-discovery by
//! the remote world-folder name. Everything is read-only.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use base64::Engine as _;
use pal_save::{CustomMarker, FogLayer, LocalData};
use serde::Serialize;

use crate::save::guid_str;

/// One world-map fog layer, ready for the frontend. `revealed_png_base64` is a
/// base64 8-bit grayscale PNG (255 = revealed, 0 = fogged), same dimensions as
/// the source mask.
#[derive(Debug, Clone, Serialize)]
pub struct FogLayerDto {
    pub map: String,
    pub width: usize,
    pub height: usize,
    pub revealed_png_base64: String,
    pub revealed_pct: f64,
}

/// A player-placed custom marker.
#[derive(Debug, Clone, Serialize)]
pub struct MarkerDto {
    pub x: f64,
    pub y: f64,
    pub icon_type: i32,
}

#[derive(Debug, Clone, Serialize)]
pub struct EffigyTypeFlagsDto {
    pub effigy_type: String,
    pub guids: Vec<String>,
}

/// Per-player map state. `uid` is the lowercase 32-char hex GUID (matching
/// [`crate::save::PlayerRef::uid`]); `x`/`y` are world coords, `null` when the
/// position could not be recovered. Flag lists hold only `true`/found keys.
#[derive(Debug, Clone, Serialize)]
pub struct MapPlayerState {
    pub uid: String,
    pub nickname: Option<String>,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub fast_travel_unlocked: Vec<String>,
    pub effigies_found: Vec<String>,
    pub effigies_found_legacy: Vec<String>,
    pub effigies_found_by_type: Vec<EffigyTypeFlagsDto>,
    pub effigy_possess_num: i32,
    pub bosses_defeated: Vec<String>,
    pub areas_found: Vec<String>,
    pub towers_defeated: Vec<String>,
}

/// One player base-camp map point (R2): world `x`/`y` of a base camp anchor
/// (the Pal Box position, else the base's building centroid).
#[derive(Debug, Clone, Serialize)]
pub struct BaseDto {
    pub x: f64,
    pub y: f64,
}

/// The full map state for one world.
#[derive(Debug, Clone, Serialize)]
pub struct MapState {
    /// `None` when no client `LocalData.sav` was found (graceful — no fog).
    pub fog: Option<Vec<FogLayerDto>>,
    /// Absolute local path the fog/markers were read from, or `None`.
    pub local_source: Option<String>,
    pub markers: Vec<MarkerDto>,
    pub players: Vec<MapPlayerState>,
    /// One point per player base camp (R2), decoded lazily from
    /// `Level.sav` `MapObjectSaveData`. `null` when no `Level.sav` was
    /// readable or the world has no base camps.
    pub bases: Option<Vec<BaseDto>>,
}

/// Read map state for one ATLAS save source.
///
/// `local_data_path` is an optional explicit client `LocalData.sav` override.
/// When it is absent/unreadable ATLAS falls back to automatic discovery. A
/// missing LocalData is always fail-soft (no fog/markers); SFTP connection/load
/// errors still surface because the server-side map state cannot be built.
#[tauri::command]
pub fn get_map_state(
    save_dir: String,
    local_data_path: Option<String>,
) -> Result<MapState, String> {
    if crate::sftp::is_sentinel(&save_dir) {
        get_sftp_map_state(&save_dir, local_data_path.as_deref())
    } else {
        get_folder_map_state(Path::new(&save_dir), &save_dir, local_data_path.as_deref())
    }
}

fn get_folder_map_state(
    dir: &Path,
    save_source: &str,
    local_data_path: Option<&str>,
) -> Result<MapState, String> {
    let level_blob = decompress(&dir.join("Level.sav")).ok();
    let nicknames = nicknames_from_level(level_blob.as_deref());
    let players = read_players(dir, &nicknames);
    let bases = bases_from_level(level_blob.as_deref());

    let (local, local_source) = discover_local_data(save_source, local_data_path);
    Ok(assemble(local, local_source, players, bases))
}

fn get_sftp_map_state(
    save_source: &str,
    local_data_path: Option<&str>,
) -> Result<MapState, String> {
    let bundle = crate::sftp::load_map_bundle(save_source)?;
    let level_blob = decompress_bytes(&bundle.level).ok();
    let nicknames = nicknames_from_level(level_blob.as_deref());
    let players = read_players_from_parts(&bundle.players, &nicknames);
    let bases = bases_from_level(level_blob.as_deref());

    // Dedicated servers normally do NOT own the player's LocalData.sav. Resolve
    // it on the ATLAS machine using the remote world's folder id, with the
    // explicit per-save override taking precedence.
    let (local, local_source) = discover_local_data(save_source, local_data_path);
    Ok(assemble(local, local_source, players, bases))
}

fn assemble(
    local: Option<LocalData>,
    local_source: Option<String>,
    players: Vec<MapPlayerState>,
    bases: Option<Vec<BaseDto>>,
) -> MapState {
    let (fog, markers) = match local {
        Some(ld) => (Some(build_fog(ld.layers)), build_markers(ld.markers)),
        None => (None, Vec::new()),
    };

    MapState {
        fog,
        local_source,
        markers,
        players,
        bases,
    }
}

fn nicknames_from_level(level_blob: Option<&[u8]>) -> HashMap<String, String> {
    level_blob
        .and_then(|b| pal_save::read_level_sav_from_blob(b).ok())
        .map(|s| {
            s.players
                .iter()
                .map(|p| (guid_str(&p.uid), p.name.clone()))
                .collect()
        })
        .unwrap_or_default()
}

fn bases_from_level(level_blob: Option<&[u8]>) -> Option<Vec<BaseDto>> {
    level_blob.and_then(|blob| {
        let pts = pal_save::read_base_points(blob).ok()?;
        if pts.is_empty() {
            return None;
        }
        Some(
            pts.into_iter()
                .map(|b| BaseDto { x: b.x, y: b.y })
                .collect(),
        )
    })
}

/// Parse every non-`_dps` player save in `<dir>/Players`, joining nicknames.
fn read_players(dir: &Path, nicknames: &HashMap<String, String>) -> Vec<MapPlayerState> {
    let mut players = Vec::new();
    let Ok(entries) = std::fs::read_dir(dir.join("Players")) else {
        return players;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("sav") {
            continue;
        }
        if path
            .file_name()
            .and_then(|s| s.to_str())
            .is_some_and(|n| n.ends_with("_dps.sav"))
        {
            continue;
        }
        let Ok(rec) = decompress(&path)
            .and_then(|b| pal_save::parse_player_map_state(&b).map_err(|e| e.to_string()))
        else {
            continue;
        };
        players.push(player_state_dto(rec, nicknames));
    }
    players
}

/// Parse the already-downloaded player-save parts from an SFTP bundle.
fn read_players_from_parts(
    parts: &[(String, Vec<u8>)],
    nicknames: &HashMap<String, String>,
) -> Vec<MapPlayerState> {
    let mut players = Vec::new();
    for (name, raw) in parts {
        if name.ends_with("_dps.sav") {
            continue;
        }
        let Ok(rec) = decompress_bytes(raw)
            .and_then(|b| pal_save::parse_player_map_state(&b).map_err(|e| e.to_string()))
        else {
            continue;
        };
        players.push(player_state_dto(rec, nicknames));
    }
    players
}

fn player_state_dto(
    rec: pal_save::PlayerMapRecord,
    nicknames: &HashMap<String, String>,
) -> MapPlayerState {
    let uid = guid_str(&rec.uid);
    let nickname = nicknames.get(&uid).cloned().filter(|n| !n.is_empty());
    MapPlayerState {
        uid,
        nickname,
        x: rec.x,
        y: rec.y,
        fast_travel_unlocked: rec.fast_travel_unlocked,
        effigies_found: rec.effigies_found,
        effigies_found_legacy: rec.effigies_found_legacy,
        effigies_found_by_type: build_effigy_groups(rec.effigies_found_by_type),
        effigy_possess_num: rec.effigy_possess_num,
        bosses_defeated: rec.bosses_defeated,
        areas_found: rec.areas_found,
        towers_defeated: rec.towers_defeated,
    }
}

fn build_effigy_groups(groups: Vec<pal_save::EffigyTypeFlags>) -> Vec<EffigyTypeFlagsDto> {
    groups
        .into_iter()
        .map(|g| EffigyTypeFlagsDto {
            effigy_type: g.effigy_type,
            guids: g.guids,
        })
        .collect()
}

/// Locate + read the client `LocalData.sav` for this world.
///
/// Precedence:
///  1. explicit manual override,
///  2. `<save_dir>/LocalData.sav` for folder/co-op saves,
///  3. `%LOCALAPPDATA%/Pal/Saved/SaveGames/<steamid>/<world>/LocalData.sav`.
///
/// For an SFTP source, `<world>` comes from the LAST component of the remote
/// world directory in the sentinel, not from the sentinel string itself.
fn discover_local_data(
    save_source: &str,
    local_data_path: Option<&str>,
) -> (Option<LocalData>, Option<String>) {
    if let Some(path) = local_data_path
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .map(PathBuf::from)
    {
        if let Some(ld) = load_local(&path) {
            return (Some(ld), Some(path.display().to_string()));
        }
    }

    if !crate::sftp::is_sentinel(save_source) {
        let direct = Path::new(save_source).join("LocalData.sav");
        if let Some(ld) = load_local(&direct) {
            return (Some(ld), Some(direct.display().to_string()));
        }
    }

    let Some(world) = world_key_from_source(save_source) else {
        return (None, None);
    };
    discover_local_for_world(&world)
}

fn world_key_from_source(save_source: &str) -> Option<String> {
    if let Some(target) = crate::sftp::parse_sentinel(save_source) {
        return target
            .world_dir
            .trim_end_matches('/')
            .rsplit('/')
            .next()
            .filter(|s| !s.is_empty())
            .map(str::to_string);
    }
    Path::new(save_source)
        .file_name()
        .and_then(|s| s.to_str())
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

fn discover_local_for_world(world: &str) -> (Option<LocalData>, Option<String>) {
    let Ok(local_app) = std::env::var("LOCALAPPDATA") else {
        return (None, None);
    };
    let root = PathBuf::from(local_app).join("Pal/Saved/SaveGames");
    let Ok(users) = std::fs::read_dir(&root) else {
        return (None, None);
    };
    for user in users.flatten() {
        let cand = user.path().join(world).join("LocalData.sav");
        if let Some(ld) = load_local(&cand) {
            return (Some(ld), Some(cand.display().to_string()));
        }
    }
    (None, None)
}

/// Read + decode a `LocalData.sav` at `path`, or `None` if absent/unreadable.
fn load_local(path: &Path) -> Option<LocalData> {
    if !path.is_file() {
        return None;
    }
    decompress(path)
        .and_then(|b| pal_save::read_local_data(&b).map_err(|e| e.to_string()))
        .ok()
}

fn decompress(path: &Path) -> Result<Vec<u8>, String> {
    let raw = std::fs::read(path).map_err(|e| e.to_string())?;
    decompress_bytes(&raw)
}

fn decompress_bytes(raw: &[u8]) -> Result<Vec<u8>, String> {
    pal_save::compress::decompress_sav(raw).map_err(|e| e.to_string())
}

/// Encode each fog layer's revealed mask as a base64 grayscale PNG.
fn build_fog(layers: Vec<FogLayer>) -> Vec<FogLayerDto> {
    layers
        .into_iter()
        .filter_map(|l| {
            let revealed_pct = l.revealed_pct();
            // 255 = revealed (alpha != 0xFF), 0 = fogged.
            let gray: Vec<u8> = l
                .alpha
                .iter()
                .map(|&a| if a == 0xFF { 0 } else { 255 })
                .collect();
            let png = encode_gray_png(l.width as u32, l.height as u32, &gray).ok()?;
            Some(FogLayerDto {
                map: l.map_id,
                width: l.width,
                height: l.height,
                revealed_png_base64: base64::engine::general_purpose::STANDARD.encode(&png),
                revealed_pct,
            })
        })
        .collect()
}

fn build_markers(markers: Vec<CustomMarker>) -> Vec<MarkerDto> {
    markers
        .into_iter()
        .map(|m| MarkerDto {
            x: m.x,
            y: m.y,
            icon_type: m.icon_type,
        })
        .collect()
}

/// Encode a `width` x `height` 8-bit grayscale buffer as a PNG byte stream.
fn encode_gray_png(width: u32, height: u32, gray: &[u8]) -> Result<Vec<u8>, png::EncodingError> {
    let mut out = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut out, width, height);
        encoder.set_color(png::ColorType::Grayscale);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header()?;
        writer.write_image_data(gray)?;
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::world_key_from_source;

    #[test]
    fn sftp_world_key_uses_remote_world_folder() {
        let source = "sftp://pal@server:22#/Pal/Saved/SaveGames/0/ABCDEF0123456789ABCDEF0123456789";
        assert_eq!(
            world_key_from_source(source).as_deref(),
            Some("ABCDEF0123456789ABCDEF0123456789")
        );
    }

    #[test]
    fn sftp_world_key_tolerates_trailing_slash() {
        let source = "sftp://pal@server:22#/srv/pal/worlds/WORLD123/";
        assert_eq!(world_key_from_source(source).as_deref(), Some("WORLD123"));
    }
}
