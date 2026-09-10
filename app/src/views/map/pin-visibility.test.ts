import { expect, test } from "bun:test";
import type { MapEntry } from "../../lib/map-coords";
import type { FogMask } from "./fog";
import type { PoiPin } from "./pins";
import {
  poiFocusId,
  resolveVisiblePois,
  type PoiVisibilityFilters,
} from "./pin-visibility";

const entry: MapEntry = {
  image: "",
  px: [100, 100],
  world_min: [0, 0],
  world_max: [100, 100],
  mask_px: [2, 2],
  world_to_px: "test",
};

const baseFilters: PoiVisibilityFilters = {
  fastTravel: true,
  alpha: true,
  effigies: true,
  bounties: true,
  towers: true,
  hideUnfoundEffigies: false,
  hideFoundEffigies: false,
};

const fogged: FogMask = {
  layer: "MainMap",
  blurred: null as unknown as HTMLCanvasElement,
  maskW: 2,
  maskH: 2,
  revealed: new Uint8Array(4),
};

function pin(
  key: string,
  kind: PoiPin["kind"] = "fast_travel",
  extra: Partial<PoiPin> = {},
): PoiPin {
  return {
    key,
    kind,
    map: "MainMap",
    x: 50,
    y: 50,
    found: false,
    known: false,
    ...extra,
  };
}

function visible(
  pois: PoiPin[],
  focusedPoiId: string | null,
  filters: PoiVisibilityFilters = baseFilters,
  effigySelection: string[] | null = null,
) {
  return resolveVisiblePois({
    entry,
    layer: "MainMap",
    k: 1,
    tx: 0,
    ty: 0,
    vw: 100,
    vh: 100,
    pois,
    filters,
    effigySelection,
    fog: fogged,
    fogOn: true,
    showHidden: false,
    focusedPoiId,
  });
}

test("focused POI alone bypasses a disabled category filter and fog", () => {
  const target = pin("target");
  const neighbor = pin("neighbor", "fast_travel", { x: 52, y: 52 });
  const filters = { ...baseFilters, fastTravel: false };
  const result = visible([target, neighbor], poiFocusId(target), filters);
  expect(result).toHaveLength(1);
  expect(result[0]?.pin.key).toBe("target");
  expect(result[0]?.focused).toBe(true);
});

test("focused POI bypasses fog without revealing a neighboring POI", () => {
  const target = pin("target");
  const neighbor = pin("neighbor", "fast_travel", { x: 52, y: 52 });
  const result = visible([target, neighbor], poiFocusId(target));
  expect(result.map((row) => row.pin.key)).toEqual(["target"]);
  expect(result[0]?.focused).toBe(true);
});

test("focused effigy bypasses type and hide-unfound filters only for itself", () => {
  const target = pin("target", "effigy", { effigyType: "CapturePower" });
  const sibling = pin("sibling", "effigy", {
    x: 52,
    y: 52,
    effigyType: "CapturePower",
  });
  const filters = { ...baseFilters, hideUnfoundEffigies: true };
  const result = visible([target, sibling], poiFocusId(target), filters, []);
  expect(result.map((row) => row.pin.key)).toEqual(["target"]);
  expect(result[0]?.focused).toBe(true);
});

test("no focus preserves normal spoiler visibility", () => {
  const target = pin("target");
  expect(visible([target], null)).toEqual([]);
});
