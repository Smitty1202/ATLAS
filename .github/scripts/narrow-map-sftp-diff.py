from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    if text.count(old) != 1:
        raise SystemExit(f"Expected exactly one match in {path}, found {text.count(old)}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "app/src-tauri/src/sftp.rs",
    '''#[derive(Debug)]
struct Bundle {
    level: Vec<u8>,
    level_meta: Option<Vec<u8>>,
    world_option: Option<Vec<u8>>,
    /// Fetched per contract (< 32 MiB); no summary seam consumes it yet.
    #[allow(dead_code)]
    local_data: Option<Vec<u8>>,
    /// Regular per-player saves, labelled `"<uid>.sav"`.
    players: Vec<(String, Vec<u8>)>,
    /// `*_dps.sav` dimensional-storage files.
    dps: Vec<(String, Vec<u8>)>,
}''',
    '''#[derive(Debug)]
pub(crate) struct Bundle {
    pub(crate) level: Vec<u8>,
    level_meta: Option<Vec<u8>>,
    world_option: Option<Vec<u8>>,
    /// Fetched per contract (< 32 MiB); no summary seam consumes it yet.
    #[allow(dead_code)]
    local_data: Option<Vec<u8>>,
    /// Regular per-player saves, labelled `"<uid>.sav"`.
    pub(crate) players: Vec<(String, Vec<u8>)>,
    /// `*_dps.sav` dimensional-storage files.
    dps: Vec<(String, Vec<u8>)>,
}''',
)

replace_once(
    "app/src-tauri/src/sftp.rs",
    '''/// Load a [`pal_save::SaveData`] from an SFTP sentinel through the live
/// connection. The one seam `crate::xbox::load_save_data` routes SFTP sources
/// through, so the solver reads remote saves unchanged.
pub fn load_save_data(sentinel: &str) -> Result<pal_save::SaveData, String> {
    let target = parse_sentinel(sentinel).ok_or_else(|| "malformed sftp sentinel".to_string())?;
    let mgr = manager();
    let bundle = block_bridge(async move { mgr.load_bundle(&target).await })?;
    pal_save::read_save_from_parts(
        &bundle.level,
        bundle.level_meta.as_deref(),
        &bundle.players,
        &bundle.dps,
    )
    .map_err(|e| e.to_string())
}''',
    '''/// Load the cached/downloaded world bundle for map-state parsing. This is
/// crate-private so `mapstate` can read the SAME remote Level/Players bytes as
/// the save inspector/solver without inventing a second SFTP path or cloning the
/// large save blobs.
pub(crate) fn load_map_bundle(sentinel: &str) -> Result<Arc<Bundle>, String> {
    let target = parse_sentinel(sentinel).ok_or_else(|| "malformed sftp sentinel".to_string())?;
    let mgr = manager();
    block_bridge(async move { mgr.load_bundle(&target).await })
}

/// Load a [`pal_save::SaveData`] from an SFTP sentinel through the live
/// connection. The one seam `crate::xbox::load_save_data` routes SFTP sources
/// through, so the solver reads remote saves unchanged.
pub fn load_save_data(sentinel: &str) -> Result<pal_save::SaveData, String> {
    let bundle = load_map_bundle(sentinel)?;
    pal_save::read_save_from_parts(
        &bundle.level,
        bundle.level_meta.as_deref(),
        &bundle.players,
        &bundle.dps,
    )
    .map_err(|e| e.to_string())
}''',
)

print("Narrowed sftp.rs to the intended map-bundle seam.")
