import { useEffect, useState } from "react";
import { invoke } from "./tauri";
import type { MapState } from "./types";

export const MAP_REFRESH_MS = 30_000;

export interface MapStateRefresh {
  mapState: MapState | null;
  mapStateLoading: boolean;
  mapStateError: string | null;
}

/**
 * Load save-backed map state, then refresh it on the same cadence the map uses:
 * every 30s while visible, plus focus/visibility wakeups. Periodic failures keep
 * the last good snapshot; only an initial failure surfaces as an error.
 */
export function useMapStateRefresh(saveDir: string): MapStateRefresh {
  const [mapState, setMapState] = useState<MapState | null>(null);
  const [mapStateLoading, setMapStateLoading] = useState(false);
  const [mapStateError, setMapStateError] = useState<string | null>(null);

  useEffect(() => {
    if (!saveDir) {
      setMapState(null);
      setMapStateLoading(false);
      setMapStateError(null);
      return;
    }

    let alive = true;
    let inFlight = false;
    let hasLoaded = false;

    setMapState(null);
    setMapStateLoading(true);
    setMapStateError(null);

    const refresh = () => {
      if (inFlight) return;
      inFlight = true;
      invoke<MapState>("get_map_state", { saveDir })
        .then((s) => {
          if (!alive) return;
          hasLoaded = true;
          setMapState(s);
          setMapStateError(null);
        })
        .catch((e) => {
          if (!alive || hasLoaded) return;
          setMapState(null);
          setMapStateError(String(e));
        })
        .finally(() => {
          inFlight = false;
          if (alive) setMapStateLoading(false);
        });
    };

    refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, MAP_REFRESH_MS);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [saveDir]);

  return { mapState, mapStateLoading, mapStateError };
}
