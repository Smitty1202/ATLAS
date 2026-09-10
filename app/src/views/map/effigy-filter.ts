export const EFFIGY_TYPES_KEY = "atlas.mapEffigyTypes";
export const EFFIGY_TYPES_EVENT = "atlas:map-effigy-types";

/** null means all effigy types are visible. An array is an explicit allow-list. */
export type EffigyTypeSelection = string[] | null;

export function readEffigyTypeSelection(): EffigyTypeSelection {
  try {
    const raw = localStorage.getItem(EFFIGY_TYPES_KEY);
    if (raw == null) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return [...new Set(parsed.filter((v): v is string => typeof v === "string"))];
  } catch {
    return null;
  }
}

export function writeEffigyTypeSelection(selection: EffigyTypeSelection) {
  try {
    if (selection === null) localStorage.removeItem(EFFIGY_TYPES_KEY);
    else localStorage.setItem(EFFIGY_TYPES_KEY, JSON.stringify(selection));
  } catch {
    // Persistence is best-effort.
  }
  window.dispatchEvent(new Event(EFFIGY_TYPES_EVENT));
}

export function effigyTypeIsVisible(
  selection: EffigyTypeSelection,
  key: string | undefined,
): boolean {
  if (selection === null) return true;
  return key != null && selection.includes(key);
}
