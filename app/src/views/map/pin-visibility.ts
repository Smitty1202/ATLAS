import { worldToPx, type MapEntry } from "../../lib/map-coords";
import { effigyTypeIsVisible, type EffigyTypeSelection } from "./effigy-filter";
import { isRevealed, type FogMask } from "./fog";
import type { PoiPin } from "./pins";

const CULL_MARGIN = 200;

export interface PoiVisibilityFilters {
  fastTravel: boolean;
  alpha: boolean;
  effigies: boolean;
  bounties: boolean;
  towers: boolean;
  hideUnfoundEffigies: boolean;
  hideFoundEffigies?: boolean;
}

export interface VisiblePoi {
  pin: PoiPin;
  left: number;
  top: number;
  focused: boolean;
}

export interface ResolveVisiblePoisOptions {
  entry: MapEntry;
  layer: string;
  k: number;
  tx: number;
  ty: number;
  vw: number;
  vh: number;
  pois: PoiPin[];
  filters: PoiVisibilityFilters;
  effigySelection: EffigyTypeSelection;
  fog: FogMask | null;
  fogOn: boolean;
  showHidden: boolean;
  focusedPoiId?: string | null;
}

export function poiFocusId(pin: PoiPin): string {
  return `${pin.kind}:${pin.key}`;
}

function pinHiddenByFilters(
  pin: PoiPin,
  filters: PoiVisibilityFilters,
  effigySelection: EffigyTypeSelection,
): boolean {
  if (pin.kind === "fast_travel" && !filters.fastTravel) return true;
  if (pin.kind === "alpha" && !filters.alpha) return true;
  if (pin.kind === "effigy" && !filters.effigies) return true;
  if (
    pin.kind === "effigy" &&
    !effigyTypeIsVisible(effigySelection, pin.effigyType)
  )
    return true;
  if (pin.kind === "effigy" && filters.hideUnfoundEffigies && !pin.found)
    return true;
  if (pin.kind === "effigy" && filters.hideFoundEffigies && pin.found)
    return true;
  if (pin.kind === "bounty" && !filters.bounties) return true;
  return pin.kind === "tower" && !filters.towers;
}

function pinHiddenByFog({
  entry,
  pin,
  fog,
  fogOn,
  showHidden,
}: {
  entry: MapEntry;
  pin: PoiPin;
  fog: FogMask | null;
  fogOn: boolean;
  showHidden: boolean;
}): boolean {
  if (!fogOn || !fog || pin.known || showHidden) return false;
  const [W, H] = entry.px;
  const [u, v] = worldToPx(entry, pin.x, pin.y);
  return !isRevealed(fog, u / W, v / H);
}

export function resolveVisiblePois({
  entry,
  layer,
  k,
  tx,
  ty,
  vw,
  vh,
  pois,
  filters,
  effigySelection,
  fog,
  fogOn,
  showHidden,
  focusedPoiId = null,
}: ResolveVisiblePoisOptions): VisiblePoi[] {
  if (k <= 0) return [];
  const minU = (-tx - CULL_MARGIN) / k;
  const minV = (-ty - CULL_MARGIN) / k;
  const maxU = (vw - tx + CULL_MARGIN) / k;
  const maxV = (vh - ty + CULL_MARGIN) / k;
  const out: VisiblePoi[] = [];
  const focusedOut: VisiblePoi[] = [];

  for (const pin of pois) {
    if (pin.map !== layer) continue;
    const focused = focusedPoiId === poiFocusId(pin);
    if (!focused && pinHiddenByFilters(pin, filters, effigySelection)) continue;

    const [u, v] = worldToPx(entry, pin.x, pin.y);
    if (u < minU || u > maxU || v < minV || v > maxV) continue;
    if (!focused && pinHiddenByFog({ entry, pin, fog, fogOn, showHidden }))
      continue;

    const visible = { pin, left: u * k, top: v * k, focused };
    if (focused) focusedOut.push(visible);
    else out.push(visible);
  }

  return [...out, ...focusedOut];
}
