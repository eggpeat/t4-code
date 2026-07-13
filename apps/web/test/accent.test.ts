// Accent preference contract: strict allowlist parsing, Pi Pink default,
// localStorage persistence keyed to this app (never the OMP runtime),
// pre-paint application via data-accent, and reset behavior.
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import {
  ACCENT_LABEL,
  ACCENT_PRESETS,
  ACCENT_STORAGE_KEY,
  applyAccent,
  DEFAULT_ACCENT,
  getAccent,
  loadAccent,
  parseAccent,
  setAccent,
  subscribeAccent,
} from "../src/theme/accent.ts";

// Minimal DOM/storage doubles so the module behaves as in a browser.
function makeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

interface DomDoubles {
  window?: unknown;
  document?: unknown;
}
const globalDoubles = globalThis as DomDoubles;
const hadWindow = "window" in globalThis;
const savedWindow = globalDoubles.window;
const savedDocument = globalDoubles.document;

let storage: Storage;
let dataset: Record<string, string | undefined>;

beforeEach(() => {
  storage = makeStorage();
  dataset = {};
  globalDoubles.window = { localStorage: storage };
  globalDoubles.document = { documentElement: { dataset } };
  applyAccent(DEFAULT_ACCENT);
});

afterEach(() => {
  if (hadWindow) globalDoubles.window = savedWindow;
  else delete (globalThis as Record<string, unknown>).window;
  if (savedDocument !== undefined) globalDoubles.document = savedDocument;
  else delete (globalThis as Record<string, unknown>).document;
});

describe("parseAccent", () => {
  it("accepts exactly the allowlisted presets", () => {
    for (const preset of ACCENT_PRESETS) {
      expect(parseAccent(preset)).toBe(preset);
    }
  });

  it("falls back to Pi Pink for anything else", () => {
    for (const junk of [null, undefined, "", "orange", "PI-PINK", "pi_pink", 42, {}, "violet "]) {
      expect(parseAccent(junk)).toBe("pi-pink");
    }
  });

  it("labels every preset in plain language", () => {
    expect(ACCENT_LABEL["pi-pink"]).toBe("Pi Pink");
    for (const preset of ACCENT_PRESETS) {
      expect(ACCENT_LABEL[preset].length).toBeGreaterThan(0);
    }
  });
});

describe("boot and persistence", () => {
  it("boots to Pi Pink with empty storage", () => {
    expect(loadAccent()).toBe("pi-pink");
  });

  it("round-trips a chosen preset through storage and the DOM attribute", () => {
    setAccent("cobalt");
    expect(storage.getItem(ACCENT_STORAGE_KEY)).toBe("cobalt");
    expect(dataset.accent).toBe("cobalt");
    expect(getAccent()).toBe("cobalt");
    // Fresh boot path reads the same value back.
    expect(loadAccent()).toBe("cobalt");
  });

  it("ignores tampered storage instead of applying it", () => {
    storage.setItem(ACCENT_STORAGE_KEY, "hotdog-stand");
    expect(loadAccent()).toBe("pi-pink");
  });

  it("survives a throwing storage (private mode) without breaking apply", () => {
    globalDoubles.window = {
      localStorage: {
        getItem: () => {
          throw new Error("denied");
        },
        setItem: () => {
          throw new Error("denied");
        },
        removeItem: () => {
          throw new Error("denied");
        },
      },
    };
    expect(loadAccent()).toBe("pi-pink");
    setAccent("teal");
    expect(getAccent()).toBe("teal");
    expect(dataset.accent).toBe("teal");
  });

  it("reset to Pi Pink clears the stored key entirely", () => {
    setAccent("violet");
    expect(storage.getItem(ACCENT_STORAGE_KEY)).toBe("violet");
    setAccent(DEFAULT_ACCENT);
    expect(storage.getItem(ACCENT_STORAGE_KEY)).toBeNull();
    expect(dataset.accent).toBe("pi-pink");
  });

  it("keeps the storage key app-scoped, never an OMP runtime key", () => {
    expect(ACCENT_STORAGE_KEY.startsWith("t4-code:")).toBe(true);
  });

  it("notifies subscribers exactly on apply", () => {
    let calls = 0;
    const unsubscribe = subscribeAccent(() => {
      calls += 1;
    });
    setAccent("magenta");
    expect(calls).toBe(1);
    unsubscribe();
    setAccent("teal");
    expect(calls).toBe(1);
  });
});
