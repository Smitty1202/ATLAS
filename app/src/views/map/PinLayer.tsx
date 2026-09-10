// The POI pin overlay: a screen-space DOM layer above the map canvas. Pins are
// positioned in *content* px (`worldToPx · k`) inside a container that carries
// only the pan translate, so a pan updates one transform (GPU-composited) and
// never re-lays-out the pins — 150+ pins stay smooth while panning. The visible
// set is culled to the viewport (plus a margin) and only recomputed when the
// pan crosses a coarse bucket, so the cull never costs per-frame work.

import {
  memo,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { worldToPx, worldInBounds, type MapEntry } from "../../lib/map-coords";
import { PalHoverCard } from "../../components/pal-hover-card";
import { isRevealed, type FogMask } from "./fog";
import {
  fallbackIcon,
  iconUrl,
  isMonoIcon,
  markerFallback,
  type IconManifest,
} from "./icons";
import { alphaIconUrl, palIconUrl, UNKNOWN_ICON } from "../../lib/assets";
import type { PoiPin } from "./pins";
import {
  EFFIGY_TYPES_EVENT,
  effigyTypeIsVisible,
  readEffigyTypeSelection,
  type EffigyTypeSelection,
} from "./effigy-filter";

/** Per-layer visibility toggles (persisted by MapView). Effigy found/unfound
 * modifiers are preferences on the effigy layer, not layers of their own. */
export interface LayerFilters {
  fastTravel: boolean;
  alpha: boolean;
  effigies: boolean;
  bounties: boolean;
  towers: boolean;
  spawns: boolean;
  players: boolean;
  markers: boolean;
  bases: boolean;
  /** When true, only collected effigies render (spoiler protection). */
  hideUnfoundEffigies: boolean;
  /** When true, collected effigies are hidden to reduce map clutter. */
  hideFoundEffigies?: boolean;
}

/** A player pin resolved to world coords + label (built by MapView). */
export interface PlayerPin {
  uid: string;
  label: string | null;
  x: number;
  y: number;
}

const CULL_MARGIN = 200;
const CULL_STEP = 160;
const LOW_ZOOM_K = 0.28;

const CYAN = "#74d3e6";
const GREEN = "#6ec25a";
const PURPLE = "#8a68d6";
const AMBER = "#f0a94a";
const DIM = "#63717f";
const MARKER = "#dcc19a";
const TOWER = "#e06a5e";
const ALPHA_SIZE = 34;

export function pinZoomScale(k: number): number {
  if (k <= 1) return 1;
  return Math.min(Math.pow(k, 0.45), 1.5);
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
  filters: LayerFilters;
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
  filters: LayerFilters,
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

const DIM_STYLE: CSSProperties = {
  transform: "scale(calc(var(--pin-dim-scale, 1) * var(--pin-zoom-scale, 1)))",
  opacity: "var(--pin-dim-op, 1)",
};

const ZOOM_STYLE: CSSProperties = {
  transform: "scale(var(--pin-zoom-scale, 1))",
};

function Glyph({
  src,
  mono,
  tint,
  size,
  dim = 1,
  grayscale = false,
}: {
  src: string;
  mono: boolean;
  tint: string;
  size: number;
  dim?: number;
  grayscale?: boolean;
}) {
  if (mono) {
    return (
      <span
        aria-hidden
        style={{
          width: size,
          height: size,
          opacity: dim,
          backgroundColor: tint,
          WebkitMaskImage: `url("${src}")`,
          maskImage: `url("${src}")`,
          WebkitMaskSize: "contain",
          maskSize: "contain",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          maskPosition: "center",
        }}
      />
    );
  }
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      draggable={false}
      width={size}
      height={size}
      className={`pointer-events-none select-none object-contain ${grayscale ? "grayscale" : ""}`}
      style={{ width: size, height: size, opacity: dim }}
    />
  );
}

function GlyphChip({
  src,
  mono,
  tint,
  size,
  dim = 1,
  grayscale = false,
  glow,
  title,
}: {
  src: string | null;
  mono: boolean;
  tint: string;
  size: number;
  dim?: number;
  grayscale?: boolean;
  glow?: string;
  title?: string;
}) {
  if (!src) return null;
  const shadow =
    "drop-shadow(0 1px 1.5px rgba(0,0,0,0.9)) drop-shadow(0 0 1px rgba(0,0,0,0.85))";
  return (
    <span
      title={title}
      className="relative flex items-center justify-center"
      style={{
        width: size,
        height: size,
        filter: glow ? `${shadow} drop-shadow(0 0 6px ${glow})` : shadow,
      }}
    >
      <Glyph
        src={src}
        mono={mono}
        tint={tint}
        size={size}
        dim={dim}
        grayscale={grayscale}
      />
    </span>
  );
}

function PinTypeIcon({
  pin,
  icons,
}: {
  pin: PoiPin;
  icons: IconManifest | null;
}) {
  if (pin.kind === "fast_travel") {
    const tint = pin.found ? CYAN : DIM;
    const entry = icons?.fast_travel ?? null;
    return (
      <GlyphChip
        src={entry ? iconUrl(entry) : fallbackIcon("fast_travel", tint)}
        mono={isMonoIcon(icons, "fast_travel")}
        tint={tint}
        size={56}
        dim={pin.found ? 1 : 0.7}
        grayscale={!pin.found}
        title={pin.found ? "Fast travel · unlocked" : "Fast travel · locked"}
      />
    );
  }
  if (pin.kind === "effigy") {
    const entry = icons?.effigy ?? null;
    const modernSrc = pin.speciesId ? palIconUrl(pin.speciesId) : null;
    const effigyName = pin.name ?? "Effigy";
    return (
      <GlyphChip
        src={
          modernSrc ??
          (entry
            ? iconUrl(entry)
            : fallbackIcon("effigy", pin.found ? DIM : GREEN))
        }
        mono={modernSrc ? false : isMonoIcon(icons, "effigy")}
        tint={GREEN}
        size={ALPHA_SIZE}
        grayscale={pin.found}
        dim={pin.found ? 0.45 : 1}
        glow={pin.found ? undefined : GREEN}
        title={pin.found ? `${effigyName} · collected` : effigyName}
      />
    );
  }
  if (pin.kind === "tower") {
    const entry = icons?.tower ?? null;
    return (
      <GlyphChip
        src={entry ? iconUrl(entry) : fallbackIcon("tower", pin.found ? DIM : TOWER)}
        mono={isMonoIcon(icons, "tower")}
        tint={TOWER}
        size={60}
        grayscale={pin.found}
        dim={pin.found ? 0.8 : 1}
        glow={pin.found ? undefined : TOWER}
        title={
          pin.found
            ? `Tower · reached${pin.name ? ` · ${pin.name}` : ""}`
            : pin.name
              ? `Tower · ${pin.name}`
              : "Syndicate Tower"
        }
      />
    );
  }
  const entry = icons?.bounty ?? null;
  const fugitiveName = pin.name ?? "Wanted Fugitive";
  return (
    <GlyphChip
      src={entry ? iconUrl(entry) : fallbackIcon("bounty", pin.found ? DIM : PURPLE)}
      mono={isMonoIcon(icons, "bounty")}
      tint={PURPLE}
      size={56}
      grayscale={pin.found}
      dim={pin.found ? 0.45 : 1}
      glow={pin.found ? undefined : PURPLE}
      title={pin.found ? `Wanted Fugitive · defeated · ${fugitiveName}` : `Wanted Fugitive · ${fugitiveName}`}
    />
  );
}

function AlphaPortrait({
  speciesId,
  size,
  defeated,
}: {
  speciesId: string | null;
  size: number;
  defeated: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const src = speciesId && !failed ? palIconUrl(speciesId) : UNKNOWN_ICON;
  return (
    <span
      className={`block overflow-hidden rounded-full bg-abyss/70 ring-2 ring-abyss shadow-[0_1px_4px_rgba(0,0,0,0.6)] transition-[box-shadow,transform] group-hover:-translate-y-0.5 group-hover:ring-amber/80 ${defeated ? "opacity-45 grayscale" : ""}`}
      style={{ width: size, height: size }}
    >
      <img
        src={src}
        alt=""
        aria-hidden
        draggable={false}
        width={size}
        height={size}
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-full w-full object-contain"
      />
    </span>
  );
}

function FieldBossNote({ level, defeated }: { level?: number; defeated: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <img
        src={alphaIconUrl}
        alt=""
        aria-hidden
        draggable={false}
        width={13}
        height={13}
        className="h-[13px] w-[13px] shrink-0 object-contain"
      />
      <span className="font-semibold text-amber-bright">Field Boss</span>
      {level != null && (
        <>
          <span className="text-ink-faint">·</span>
          <span className="tabular-nums text-ink">Lv {level}</span>
        </>
      )}
      {defeated && (
        <>
          <span className="text-ink-faint">·</span>
          <span className="text-ink-dim">Defeated</span>
        </>
      )}
    </span>
  );
}

function FocusPulse() {
  return (
    <>
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full border-2 border-amber/80 bg-amber/20"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber shadow-lg"
      />
    </>
  );
}

function AlphaPin({
  pin,
  left,
  top,
  icons,
  onOpenSpecies,
  focused,
}: {
  pin: PoiPin;
  left: number;
  top: number;
  icons: IconManifest | null;
  onOpenSpecies: (id: string) => void;
  focused: boolean;
}) {
  const badgeSrc = icons?.alpha_badge
    ? iconUrl(icons.alpha_badge)
    : fallbackIcon("alpha_badge", AMBER);
  const button = (
    <button
      type="button"
      tabIndex={-1}
      onClick={() => pin.speciesId && onOpenSpecies(pin.speciesId)}
      className={`group pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-amber ${
        focused ? "z-20" : ""
      }`}
      style={{ left, top }}
      aria-label={`Field Boss${pin.level != null ? `, level ${pin.level}` : ""}${pin.found ? ", defeated" : ""}`}
    >
      {focused && <FocusPulse />}
      <span
        className="relative block transition-transform duration-150 ease-out"
        style={ZOOM_STYLE}
      >
        <AlphaPortrait speciesId={pin.speciesId ?? null} size={ALPHA_SIZE} defeated={pin.found} />
        {badgeSrc && (
          <span
            aria-hidden
            className={`pointer-events-none absolute -left-1 -top-1 block ${pin.found ? "opacity-45 grayscale" : ""}`}
          >
            <Glyph
              src={badgeSrc}
              mono={isMonoIcon(icons, "alpha_badge")}
              tint={AMBER}
              size={15}
            />
          </span>
        )}
      </span>
    </button>
  );
  if (!pin.speciesId) return button;
  return (
    <PalHoverCard speciesId={pin.speciesId} note={<FieldBossNote level={pin.level} defeated={pin.found} />}>
      {button}
    </PalHoverCard>
  );
}

function PinLayer({
  entry,
  layer,
  k,
  tx,
  ty,
  vw,
  vh,
  pois,
  players,
  markers,
  bases,
  fog,
  fogOn,
  showHidden,
  filters,
  icons,
  onOpenSpecies,
  containerRef,
  focusedPoiId = null,
}: {
  entry: MapEntry;
  layer: string;
  k: number;
  tx: number;
  ty: number;
  vw: number;
  vh: number;
  pois: PoiPin[];
  players: PlayerPin[];
  markers: { x: number; y: number; icon_type: number }[];
  bases: { x: number; y: number }[];
  fog: FogMask | null;
  fogOn: boolean;
  showHidden: boolean;
  filters: LayerFilters;
  icons: IconManifest | null;
  onOpenSpecies: (id: string) => void;
  containerRef?: RefObject<HTMLDivElement | null>;
  focusedPoiId?: string | null;
}) {
  const bx = Math.round(tx / CULL_STEP);
  const by = Math.round(ty / CULL_STEP);
  const lowZoom = k < LOW_ZOOM_K;
  const [effigySelection, setEffigySelection] = useState<EffigyTypeSelection>(
    readEffigyTypeSelection,
  );

  useEffect(() => {
    const sync = () => setEffigySelection(readEffigyTypeSelection());
    window.addEventListener(EFFIGY_TYPES_EVENT, sync);
    return () => window.removeEventListener(EFFIGY_TYPES_EVENT, sync);
  }, []);

  const visiblePois = useMemo(() => {
    return resolveVisiblePois({
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
      focusedPoiId,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pois,
    layer,
    k,
    bx,
    by,
    vw,
    vh,
    filters,
    effigySelection,
    fog,
    fogOn,
    showHidden,
    entry,
    focusedPoiId,
  ]);

  const visiblePlayers = useMemo(() => {
    if (!filters.players) return [];
    return players
      .filter((p) => worldInBounds(entry, p.x, p.y))
      .map((p) => {
        const [u, v] = worldToPx(entry, p.x, p.y);
        return { p, left: u * k, top: v * k };
      });
  }, [players, filters.players, k, entry]);

  const visibleMarkers = useMemo(() => {
    if (!filters.markers) return [];
    return markers
      .filter((m) => worldInBounds(entry, m.x, m.y))
      .map((m, i) => {
        const [u, v] = worldToPx(entry, m.x, m.y);
        return { m, i, left: u * k, top: v * k };
      });
  }, [markers, filters.markers, k, entry]);

  const visibleBases = useMemo(() => {
    if (!filters.bases) return [];
    return bases
      .filter((b) => worldInBounds(entry, b.x, b.y))
      .map((b, i) => {
        const [u, v] = worldToPx(entry, b.x, b.y);
        return { i, left: u * k, top: v * k };
      });
  }, [bases, filters.bases, k, entry]);

  const containerStyle = {
    transform: `translate(${tx}px, ${ty}px)`,
    "--pin-dim-scale": lowZoom ? "0.8" : "1",
    "--pin-dim-op": lowZoom ? "0.85" : "1",
    "--pin-zoom-scale": String(pinZoomScale(k)),
  } as CSSProperties;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div
        ref={containerRef}
        className="absolute left-0 top-0 origin-top-left"
        style={containerStyle}
      >
        {visibleMarkers.map(({ m, i, left, top }) => {
          const key = `marker_${m.icon_type}`;
          const entryIcon = icons?.[key] ?? null;
          return (
            <div
              key={`mk${i}`}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left, top }}
            >
              <span
                className="block transition-[transform,opacity] duration-150 ease-out"
                style={DIM_STYLE}
              >
                <GlyphChip
                  src={entryIcon ? iconUrl(entryIcon) : markerFallback(MARKER)}
                  mono={entryIcon ? isMonoIcon(icons, key) : false}
                  tint={MARKER}
                  size={28}
                  title="Custom marker"
                />
              </span>
            </div>
          );
        })}

        {visibleBases.map(({ i, left, top }) => {
          const entryIcon = icons?.base ?? null;
          return (
            <div
              key={`bs${i}`}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left, top }}
            >
              <span
                className="block transition-transform duration-150 ease-out"
                style={ZOOM_STYLE}
              >
                <GlyphChip
                  src={entryIcon ? iconUrl(entryIcon) : fallbackIcon("base", AMBER)}
                  mono={isMonoIcon(icons, "base")}
                  tint={AMBER}
                  size={32}
                  title="Base camp"
                />
              </span>
            </div>
          );
        })}

        {visiblePois.map(({ pin, left, top, focused }) =>
          pin.kind === "alpha" ? (
            <AlphaPin
              key={pin.key}
              pin={pin}
              left={left}
              top={top}
              icons={icons}
              onOpenSpecies={onOpenSpecies}
              focused={focused}
            />
          ) : (
            <div
              key={pin.key}
              className={`group pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 ${
                focused ? "z-20" : ""
              }`}
              style={{ left, top }}
            >
              {focused && <FocusPulse />}
              <span
                className="block transition-[transform,opacity] duration-150 ease-out"
                style={pin.kind === "tower" ? ZOOM_STYLE : DIM_STYLE}
              >
                <PinTypeIcon pin={pin} icons={icons} />
              </span>
              {pin.name && (
                <span className="pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded-xs border border-line bg-panel/90 px-1.5 py-0.5 font-mono text-[9px] tracking-wide text-ink opacity-0 transition-opacity group-hover:opacity-100">
                  {pin.name}
                  {pin.kind === "bounty" && pin.found ? " · Defeated" : ""}
                </span>
              )}
            </div>
          ),
        )}

        {visiblePlayers.map(({ p, left, top }) => (
          <div
            key={p.uid}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
            style={{ left, top }}
          >
            <span
              className="h-3 w-3 rounded-full border-2 border-abyss"
              style={{ background: AMBER, boxShadow: `0 0 0 1px ${AMBER}80` }}
            />
            {p.label && (
              <span className="mt-1 whitespace-nowrap rounded-xs border border-line bg-panel/90 px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-ink">
                {p.label}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default memo(PinLayer);
