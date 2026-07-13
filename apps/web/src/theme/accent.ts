// Interactive accent preference. This is an APP preference stored on this
// device (localStorage) — it is never part of the Oh My Pi runtime
// configuration and never travels over the wire. The value is a strict
// allowlist member; anything else (tampered storage, older versions)
// silently falls back to the Pi Pink default. `applyAccent` writes
// `data-accent` on <html>; call it at module scope before the first render
// so the first paint already carries the chosen accent (same no-flash
// technique as theme.ts).

export const ACCENT_STORAGE_KEY = "t4-code:accent:v1";

export const ACCENT_PRESETS = [
  "pi-pink",
  "magenta",
  "violet",
  "cobalt",
  "teal",
  "mono",
] as const;

export type AccentPreset = (typeof ACCENT_PRESETS)[number];

export const DEFAULT_ACCENT: AccentPreset = "pi-pink";

/** Plain-language labels for the settings swatches. */
export const ACCENT_LABEL: Record<AccentPreset, string> = {
  "pi-pink": "Pi Pink",
  magenta: "Magenta",
  violet: "Violet",
  cobalt: "Cobalt",
  teal: "Teal",
  mono: "Mono",
};

/** Strict allowlist parse: unknown input degrades to the default. */
export function parseAccent(raw: unknown): AccentPreset {
  return ACCENT_PRESETS.find((preset) => preset === raw) ?? DEFAULT_ACCENT;
}

export function loadAccent(): AccentPreset {
  if (typeof window === "undefined") return DEFAULT_ACCENT;
  try {
    return parseAccent(window.localStorage.getItem(ACCENT_STORAGE_KEY));
  } catch {
    return DEFAULT_ACCENT;
  }
}

let current: AccentPreset = DEFAULT_ACCENT;
const listeners = new Set<() => void>();

/** Stamp the accent on <html>. Idempotent; safe before React mounts. */
export function applyAccent(preset: AccentPreset): void {
  current = preset;
  if (typeof document !== "undefined") {
    document.documentElement.dataset.accent = preset;
  }
  for (const listener of listeners) listener();
}

/** Persist and apply a new preference. */
export function setAccent(preset: AccentPreset): void {
  const safe = parseAccent(preset);
  try {
    if (safe === DEFAULT_ACCENT) {
      window.localStorage.removeItem(ACCENT_STORAGE_KEY);
    } else {
      window.localStorage.setItem(ACCENT_STORAGE_KEY, safe);
    }
  } catch {
    // Preference still applies for this window; it just won't persist.
  }
  applyAccent(safe);
}

export function getAccent(): AccentPreset {
  return current;
}

export function subscribeAccent(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
