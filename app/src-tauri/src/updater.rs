//! Signed in-app update plumbing for the desktop build.
//!
//! ATLAS uses Tauri's official updater plugin rather than downloading installers
//! itself. `check_update` asks the configured updater endpoint for a newer signed
//! release and stores that pending `Update` in memory. `install_update` consumes
//! the pending update, streams download progress to the frontend through an IPC
//! channel, verifies Tauri's mandatory signature, and hands the verified package
//! to the Windows NSIS updater. On Windows Tauri exits ATLAS automatically when
//! the installer begins, because the running executable cannot replace itself.
//!
//! Release builds receive the updater endpoint + public verification key through
//! a generated Tauri config in `.github/workflows/release.yml`. Development and
//! browser builds therefore never need the private signing key and never write it
//! to disk or source control.

use parking_lot::Mutex;
use serde::Serialize;
use tauri::{ipc::Channel, AppHandle, State};
use tauri_plugin_updater::{Update, UpdaterExt};

/// A checked update is held only in memory between the About panel's
/// "Check for updates" and "Download & install" actions.
#[derive(Default)]
pub(crate) struct PendingUpdate(Mutex<Option<Update>>);

/// Result shown by the About panel. `status` is intentionally kept compatible
/// with the previous read-only updater so the UI's standing/error states remain
/// simple while the transport underneath changes completely.
#[derive(Debug, Clone, Serialize)]
pub struct UpdateCheck {
    pub status: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
}

impl UpdateCheck {
    fn up_to_date() -> Self {
        Self {
            status: "up_to_date",
            latest: None,
            notes: None,
        }
    }

    fn available(latest: String, notes: Option<String>) -> Self {
        Self {
            status: "update_available",
            latest: Some(latest),
            notes: notes.filter(|body| !body.trim().is_empty()),
        }
    }
}

/// Download progress sent over the command's Tauri IPC channel.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "event", content = "data")]
pub enum DownloadEvent {
    #[serde(rename_all = "camelCase")]
    Started {
        content_length: Option<u64>,
    },
    #[serde(rename_all = "camelCase")]
    Progress {
        chunk_length: usize,
    },
    Finished,
}

/// Ask Tauri's configured endpoint whether a newer signed ATLAS release exists.
/// Tauri performs the SemVer comparison against the running package version.
#[tauri::command]
pub async fn check_update(
    app: AppHandle,
    pending_update: State<'_, PendingUpdate>,
) -> Result<UpdateCheck, String> {
    let updater = app
        .updater()
        .map_err(|e| format!("updater unavailable: {e}"))?;
    let update = updater
        .check()
        .await
        .map_err(|e| format!("update check failed: {e}"))?;

    match update {
        Some(update) => {
            let result = UpdateCheck::available(update.version.clone(), update.body.clone());
            *pending_update.0.lock() = Some(update);
            Ok(result)
        }
        None => {
            *pending_update.0.lock() = None;
            Ok(UpdateCheck::up_to_date())
        }
    }
}

/// Download, signature-verify, and install the update found by `check_update`.
/// If download/verification fails, the same pending update is restored so the
/// user can retry without performing a second check.
#[tauri::command]
pub async fn install_update(
    pending_update: State<'_, PendingUpdate>,
    on_event: Channel<DownloadEvent>,
) -> Result<(), String> {
    let Some(update) = pending_update.0.lock().take() else {
        return Err("there is no pending update; check for updates first".to_string());
    };

    let mut started = false;
    let install_result = update
        .download_and_install(
            |chunk_length, content_length| {
                if !started {
                    let _ = on_event.send(DownloadEvent::Started { content_length });
                    started = true;
                }
                let _ = on_event.send(DownloadEvent::Progress { chunk_length });
            },
            || {
                let _ = on_event.send(DownloadEvent::Finished);
            },
        )
        .await;

    if let Err(e) = install_result {
        *pending_update.0.lock() = Some(update);
        return Err(format!("update install failed: {e}"));
    }

    Ok(())
}

/// Embedded data-pack identity for the About panel: the pal-data pack version
/// (e.g. `"v26"`) and the Palworld game build it was extracted from.
#[derive(Debug, Clone, Serialize)]
pub struct DataPackInfo {
    pub pack_version: String,
    pub game_build: String,
}

#[tauri::command]
pub fn data_pack_info() -> DataPackInfo {
    let gd = pal_data::GameData::get();
    DataPackInfo {
        pack_version: gd.version().to_string(),
        game_build: gd.game_build().to_string(),
    }
}
