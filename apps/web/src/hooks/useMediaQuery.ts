// Adapted from T3 Code apps/web/src/hooks/useMediaQuery.ts (MIT, T3 Tools
// Inc., commit f61fa9499d96fee825492aba204593c37b27e0cb). OMP changes:
// breakpoint DSL dropped; callers pass a raw media query string.
import { useCallback, useSyncExternalStore } from "react";

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (callback: () => void) => {
      if (typeof window === "undefined") return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener("change", callback);
      return () => mql.removeEventListener("change", callback);
    },
    [query],
  );

  const getSnapshot = useCallback(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  }, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** The right pane docks at and above this width; below it becomes a sheet. */
export const RIGHT_PANE_DOCK_QUERY = "(min-width: 980px)";
/** The rail overlays at and below this width. */
export const RAIL_OVERLAY_QUERY = "(max-width: 767px)";
