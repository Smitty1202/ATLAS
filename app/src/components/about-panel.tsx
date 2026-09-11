// About panel: app version, data-pack identity, signed in-app updates, and the
// license note. Mounted from the sidebar footer via <AboutButton />.
//
// Desktop update checks/installations are handled by Rust through Tauri's
// official updater plugin (src-tauri/src/updater.rs). Browser builds keep the
// updater hidden. A failed network/signature/install operation remains local to
// this panel and never crashes the rest of ATLAS.

import { useCallback, useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { Channel } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { invoke } from "../lib/tauri";
import { caps } from "../lib/caps";

interface UpdateCheck {
  status: "disabled" | "up_to_date" | "update_available" | "error";
  latest?: string;
  notes?: string;
}

interface DownloadEvent {
  event: "Started" | "Progress" | "Finished";
  data?: {
    contentLength?: number | null;
    chunkLength?: number;
  };
}

interface DataPackInfo {
  pack_version: string;
  game_build: string;
}

const REPO_URL = "https://github.com/Smitty1202/ATLAS";
const RELEASES_URL = "https://github.com/Smitty1202/ATLAS/releases";
const UPSTREAM_URL = "https://github.com/Wire15/pal-lab";

function openExternal(url: string): void {
  if (caps.isTauri) openUrl(url).catch(() => {});
  else window.open(url, "_blank", "noopener");
}

const DISABLED_MESSAGE =
  "Checks the signed ATLAS release feed for a newer desktop build.";

function useAppVersion(): string {
  const [v, setV] = useState<string>(caps.isTauri ? "" : __APP_VERSION__);
  useEffect(() => {
    if (!caps.isTauri) return;
    let alive = true;
    getVersion()
      .then((x) => alive && setV(x))
      .catch(() => alive && setV("unknown"));
    return () => {
      alive = false;
    };
  }, []);
  return v;
}

export default function AboutButton() {
  const [open, setOpen] = useState(false);
  const version = useAppVersion();
  const versionLabel = version ? `v${version}` : "";
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="About Smitty's ATLAS"
        className="mt-2.5 flex w-full items-center gap-2 rounded px-1 py-0.5 font-mono text-[10px] uppercase tracking-wider text-ink-faint transition-colors hover:text-ink-dim"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-good" />
        ATLAS {versionLabel && <>&middot; {versionLabel}</>}
      </button>
      {open && <AboutModal onClose={() => setOpen(false)} />}
    </>
  );
}

function AboutModal({ onClose }: { onClose: () => void }) {
  const version = useAppVersion();
  const [pack, setPack] = useState<DataPackInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<UpdateCheck | null>(null);
  const [installing, setInstalling] = useState(false);
  const [downloaded, setDownloaded] = useState(0);
  const [downloadTotal, setDownloadTotal] = useState<number | null>(null);
  const [downloadFinished, setDownloadFinished] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !installing) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [installing, onClose]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const p = await invoke<DataPackInfo>("data_pack_info");
        if (alive) setPack(p);
      } catch {
        // No fixture in browser dev — leave the pack row hidden.
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const resetInstallState = useCallback(() => {
    setInstalling(false);
    setDownloaded(0);
    setDownloadTotal(null);
    setDownloadFinished(false);
    setInstallError(null);
    setInstalled(false);
  }, []);

  const check = useCallback(async () => {
    resetInstallState();
    setChecking(true);
    setResult(null);
    try {
      const r = await invoke<UpdateCheck>("check_update");
      setResult(r);
    } catch (e) {
      setResult({ status: "error", notes: String(e) });
    } finally {
      setChecking(false);
    }
  }, [resetInstallState]);

  const install = useCallback(async () => {
    if (!caps.isTauri || installing) return;

    setInstalling(true);
    setDownloaded(0);
    setDownloadTotal(null);
    setDownloadFinished(false);
    setInstallError(null);
    setInstalled(false);

    let downloadedNow = 0;
    const onEvent = new Channel<DownloadEvent>();
    onEvent.onmessage = (message) => {
      if (message.event === "Started") {
        const total = message.data?.contentLength;
        setDownloadTotal(typeof total === "number" ? total : null);
        return;
      }
      if (message.event === "Progress") {
        downloadedNow += message.data?.chunkLength ?? 0;
        setDownloaded(downloadedNow);
        return;
      }
      if (message.event === "Finished") {
        setDownloadFinished(true);
      }
    };

    try {
      await invoke<void>("install_update", { onEvent });
      // Windows normally exits ATLAS before this line while NSIS takes over.
      // Keep a sane fallback for any platform where the command returns.
      setInstalled(true);
    } catch (e) {
      setInstallError(String(e));
    } finally {
      setInstalling(false);
    }
  }, [installing]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-abyss/70 p-6"
      onMouseDown={() => !installing && onClose()}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-modal-title"
        className="w-full max-w-md overflow-hidden rounded-lg border border-line bg-panel"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="border-b border-line px-5 py-4">
          <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-amber">
            About
          </div>
          <h2
            id="about-modal-title"
            className="mt-0.5 font-display text-lg font-bold tracking-wide text-ink"
          >
            Smitty&apos;s ATLAS
          </h2>
          <div className="mt-1 font-mono text-[12px] text-ink-dim">
            v{version || "\u2026"}
          </div>
        </div>

        <div className="border-b border-line px-5 py-4">
          <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-ink-faint">
            Data pack
          </div>
          {pack ? (
            <dl className="flex flex-col gap-1 font-mono text-[12px]">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-faint">Pack version</dt>
                <dd className="text-ink-dim">{pack.pack_version}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-faint">Game build</dt>
                <dd className="text-ink-dim">{pack.game_build}</dd>
              </div>
            </dl>
          ) : (
            <p className="font-mono text-[12px] text-ink-faint">
              Unavailable in browser preview.
            </p>
          )}
        </div>

        <div className="border-b border-line px-5 py-4">
          {caps.updater ? (
            <>
              <div className="mb-2.5 flex items-center justify-between gap-3">
                <div className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
                  Updates
                </div>
                <button
                  onClick={check}
                  disabled={checking || installing}
                  className="rounded-md border border-line bg-raised px-3 py-1.5 text-[12px] font-medium text-ink-dim transition-colors hover:border-amber/40 hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {checking ? "Checking\u2026" : "Check for updates"}
                </button>
              </div>
              <UpdateResult
                result={result}
                onInstall={install}
                installing={installing}
                downloaded={downloaded}
                downloadTotal={downloadTotal}
                downloadFinished={downloadFinished}
                installError={installError}
                installed={installed}
              />
            </>
          ) : (
            <>
              <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-ink-faint">
                Desktop app
              </div>
              <p className="text-[12px] leading-relaxed text-ink-faint">
                {caps.isWeb ? "Web version" : "Preview build"} &mdash;{" "}
                <button
                  onClick={() => openExternal(RELEASES_URL)}
                  className="text-amber transition-colors hover:text-amber-bright"
                >
                  get the desktop app
                </button>{" "}
                for live tracking.
              </p>
            </>
          )}
        </div>

        <div className="px-5 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={() => openExternal(REPO_URL)}
              className="font-mono text-[11px] text-ink-dim transition-colors hover:text-amber"
            >
              github.com/Smitty1202/ATLAS
            </button>
            <button
              onClick={onClose}
              disabled={installing}
              className="shrink-0 rounded-md px-3 py-1.5 text-[13px] font-medium text-ink-faint transition-colors hover:text-ink-dim disabled:cursor-not-allowed disabled:opacity-50"
            >
              Close
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
            MIT licensed. Read-only &mdash; ATLAS never modifies your saves.
          </p>
          <p className="mt-1.5 text-[10px] leading-relaxed text-ink-faint/70">
            Derived from{" "}
            <button
              onClick={() => openExternal(UPSTREAM_URL)}
              className="text-ink-faint transition-colors hover:text-amber"
            >
              Pal Lab by Wire15
            </button>{" "}
            under the MIT License. Imported baseline: Pal Lab v1.10.1
            (e21ec37f643e2ca913cbf2de4f5898bc5fef70d5).
          </p>
          <p className="mt-1.5 text-[10px] leading-relaxed text-ink-faint/70">
            Unofficial fan tool. Palworld is © Pocketpair, Inc. Not affiliated
            with or endorsed by Pocketpair.
          </p>
        </div>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function UpdateResult({
  result,
  onInstall,
  installing,
  downloaded,
  downloadTotal,
  downloadFinished,
  installError,
  installed,
}: {
  result: UpdateCheck | null;
  onInstall: () => void;
  installing: boolean;
  downloaded: number;
  downloadTotal: number | null;
  downloadFinished: boolean;
  installError: string | null;
  installed: boolean;
}) {
  const status = result?.status ?? "disabled";
  const percent =
    downloadTotal && downloadTotal > 0
      ? Math.min(100, Math.round((downloaded / downloadTotal) * 100))
      : null;

  if (status === "update_available") {
    return (
      <div className="rounded-md border border-amber/40 bg-amber/10 px-3 py-2.5">
        <div className="text-[12px] font-medium text-ink">
          Update available{result?.latest ? `: v${result.latest}` : ""}
        </div>
        {result?.notes && (
          <p className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap text-[11px] leading-relaxed text-ink-dim">
            {result.notes}
          </p>
        )}

        {(installing || downloaded > 0 || downloadFinished) && (
          <div className="mt-2.5">
            <div className="mb-1 flex items-center justify-between gap-3 font-mono text-[10px] text-ink-dim">
              <span>
                {downloadFinished ? "Installing update\u2026" : "Downloading update\u2026"}
              </span>
              {!downloadFinished && (
                <span>
                  {percent !== null
                    ? `${percent}%`
                    : downloaded > 0
                      ? formatBytes(downloaded)
                      : ""}
                </span>
              )}
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-abyss/70">
              <div
                className="h-full bg-amber transition-[width] duration-150"
                style={{ width: `${downloadFinished ? 100 : (percent ?? 8)}%` }}
              />
            </div>
          </div>
        )}

        {installError && (
          <div className="mt-2 rounded border border-bad/40 bg-bad/10 px-2 py-1.5 text-[11px] text-bad">
            {installError}
          </div>
        )}

        {installed ? (
          <p className="mt-2 text-[11px] text-good">
            Update installed. Restart ATLAS to finish.
          </p>
        ) : (
          <button
            onClick={onInstall}
            disabled={installing}
            className="mt-2.5 rounded-md bg-amber px-3 py-1.5 text-[12px] font-semibold text-abyss transition-colors hover:bg-amber-bright disabled:cursor-not-allowed disabled:opacity-60"
          >
            {installing
              ? downloadFinished
                ? "Installing\u2026"
                : "Downloading\u2026"
              : installError
                ? "Retry download & install"
                : "Download & install"}
          </button>
        )}

        <p className="mt-2 text-[10px] leading-relaxed text-ink-faint">
          The update is signature-verified before installation. On Windows,
          ATLAS closes automatically while the installer applies it.
        </p>
      </div>
    );
  }

  if (status === "up_to_date") {
    return <p className="text-[12px] text-ink-dim">You&rsquo;re up to date.</p>;
  }

  if (status === "error") {
    return (
      <div className="rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-[12px] text-bad">
        Couldn&rsquo;t check for updates{result?.notes ? `: ${result.notes}` : "."}
      </div>
    );
  }

  return (
    <p className="text-[12px] leading-relaxed text-ink-faint">
      {DISABLED_MESSAGE}
    </p>
  );
}
