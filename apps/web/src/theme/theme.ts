// Theme application without flash. Adapted from T3 Code
// apps/web/src/hooks/useTheme.ts (MIT, T3 Tools Inc., commit
// f61fa9499d96fee825492aba204593c37b27e0cb). OMP changes: preference lives in
// the workspace store (not its own storage key), Effect/desktop-bridge sync
// dropped, module state reduced to the applied-theme memo.
import type { ThemePreference } from "../state/workspace-store.ts";

const SYSTEM_DARK_QUERY = "(prefers-color-scheme: dark)";

let lastApplied: { theme: ThemePreference; systemDark: boolean } | null = null;

export function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(SYSTEM_DARK_QUERY).matches
  );
}

export function resolveTheme(preference: ThemePreference): "light" | "dark" {
  if (preference === "system") return systemPrefersDark() ? "dark" : "light";
  return preference;
}

/**
 * Toggle the `dark` root class. Call once at module scope before the first
 * render (no flash), then on every preference change with
 * `suppressTransitions` so surfaces flip without animating.
 */
export function applyTheme(preference: ThemePreference, suppressTransitions = false): void {
  if (typeof document === "undefined") return;
  const systemDark = preference === "system" && systemPrefersDark();
  if (lastApplied?.theme === preference && lastApplied.systemDark === systemDark) return;

  const root = document.documentElement;
  if (suppressTransitions) root.classList.add("no-transitions");
  root.classList.toggle("dark", resolveTheme(preference) === "dark");
  const dark = resolveTheme(preference) === "dark";
  root.style.backgroundColor = "var(--background)";
  root.style.colorScheme = dark ? "dark" : "light";
  lastApplied = { theme: preference, systemDark };
  if (suppressTransitions) {
    // Force a reflow so no-transitions lands before the class flip paints.
    void root.offsetHeight;
    requestAnimationFrame(() => root.classList.remove("no-transitions"));
  }
}

/** Re-apply on OS scheme changes while the preference is "system". */
export function watchSystemTheme(getPreference: () => ThemePreference): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const query = window.matchMedia(SYSTEM_DARK_QUERY);
  const handleChange = () => {
    if (getPreference() === "system") applyTheme("system", true);
  };
  query.addEventListener("change", handleChange);
  return () => query.removeEventListener("change", handleChange);
}
