// Roles/agents editor logic over the real settings pipeline: selector
// parsing and validation, role add/edit/remove staging, cycle reorder,
// task-agent override chains (ordered, lossless through the string setting),
// enable/disable staging, and CAS conflict recovery with role drafts. The
// catalog is built by the live adapter from wire-shaped frames, and every
// edit rides the same store the generic rows use.
import { describe, expect, it } from "vite-plus/test";

import type { CatalogFrame, SettingsFrame } from "@t4-code/protocol";

import { buildLiveSettingsCatalog } from "./live-catalog.ts";
import {
  BUILTIN_ROLES,
  draftedValue,
  knownRoleIds,
  listValue,
  moveItem,
  parseChain,
  parseSelector,
  recordValue,
  selectorAdvisory,
  serializeChain,
  validateSelector,
  withThinking,
} from "./roles-model.ts";
import type {
  SettingsCatalogMetadata,
  SettingsController,
  SettingsSaveRequest,
  SettingsSaveResult,
} from "./schema.ts";
import { applyChangesToCatalog } from "./fixtures.ts";
import { createSettingsStore } from "./settings-store.ts";

// ─── Wire-shaped fixtures ───────────────────────────────────────────────────

function settingItem(path: string, metadata: Record<string, unknown>): Record<string, unknown> {
  return { id: `setting:${path}`, kind: "setting", name: path, metadata: { path, ...metadata } };
}

const CHAIN = "google/gemini-3-pro, openrouter/moonshotai/kimi-k2.7";

const ROLE_ITEMS = [
  settingItem("modelRoles", {
    label: "Model roles",
    controlType: "record",
    effective: {
      default: "anthropic/claude-fable-5:high",
      smol: "google/gemini-3-flash",
      "Opus 4.6": "anthropic/claude-opus-4-6",
    },
    effectiveSource: "global",
    configured: true,
    sensitive: false,
    tab: "model",
  }),
  settingItem("cycleOrder", {
    label: "Quick-switch cycle",
    controlType: "array",
    effective: ["smol", "default", "slow"],
    effectiveSource: "global",
    configured: true,
    sensitive: false,
    tab: "model",
  }),
  settingItem("task.agentModelOverrides", {
    label: "Agent model overrides",
    controlType: "record",
    effective: { "gemini-executor": CHAIN },
    effectiveSource: "global",
    configured: true,
    sensitive: false,
    tab: "tasks",
  }),
  settingItem("task.disabledAgents", {
    label: "Disabled agents",
    controlType: "array",
    effective: ["scribe"],
    effectiveSource: "global",
    configured: true,
    sensitive: false,
    tab: "tasks",
  }),
];

function builtCatalog(): SettingsCatalogMetadata {
  // Test seam: fixture frames are hand-built rather than wire-decoded.
  const catalog = {
    v: "omp-app/1",
    type: "catalog",
    hostId: "host-1",
    revision: "rev-1",
    items: ROLE_ITEMS,
  } as unknown as CatalogFrame;
  const settings = {
    v: "omp-app/1",
    type: "settings",
    hostId: "host-1",
    revision: "rev-1",
    settings: {},
  } as unknown as SettingsFrame;
  const { catalog: built, issues } = buildLiveSettingsCatalog({ catalog, settings, hostLabel: "build-linux" });
  expect(issues).toEqual([]);
  return built;
}

interface LocalControllerOptions {
  readonly conflictWith?: SettingsCatalogMetadata;
}

/** Minimal CAS-honoring controller over any catalog shape. */
function localController(initial: SettingsCatalogMetadata, options: LocalControllerOptions = {}): SettingsController {
  let catalog = initial;
  let saves = 0;
  return {
    save(request: SettingsSaveRequest): Promise<SettingsSaveResult> {
      saves += 1;
      if (options.conflictWith !== undefined && saves === 1) {
        catalog = options.conflictWith;
        return Promise.resolve({ outcome: "conflict", catalog });
      }
      if (request.revision !== catalog.revision) {
        return Promise.resolve({ outcome: "conflict", catalog });
      }
      catalog = applyChangesToCatalog(catalog, request.changes, `${catalog.revision}-s${saves}`);
      return Promise.resolve({ outcome: "applied", catalog });
    },
  };
}

// ─── Selector helpers ───────────────────────────────────────────────────────

describe("model selectors", () => {
  it("splits thinking suffixes off, and only real levels", () => {
    expect(parseSelector("xai-oauth/grok-4.5:high")).toEqual({ base: "xai-oauth/grok-4.5", thinking: "high" });
    expect(parseSelector("anthropic/claude-fable-5")).toEqual({ base: "anthropic/claude-fable-5", thinking: null });
    // A colon that is not a thinking level stays part of the selector.
    expect(parseSelector("weird/model:v2")).toEqual({ base: "weird/model:v2", thinking: null });
    expect(withThinking("a/b", "xhigh")).toBe("a/b:xhigh");
    expect(withThinking("a/b", null)).toBe("a/b");
  });

  it("hard-rejects empty, spaced, slash-less, and oversized selectors", () => {
    expect(validateSelector("")).toMatch(/Enter/);
    expect(validateSelector("has space/model")).toMatch(/spaces/);
    expect(validateSelector("no-slash")).toMatch(/provider\/model-id/);
    expect(validateSelector("p/".padEnd(300, "x"))).toMatch(/256/);
    expect(validateSelector("anthropic/claude-fable-5:high")).toBeNull();
    expect(validateSelector("pi/default")).toBeNull();
    expect(validateSelector("openrouter/*")).toBeNull();
  });

  it("advises without blocking: self-alias and not-in-catalog", () => {
    const catalog = new Set(["anthropic/claude-fable-5"]);
    expect(selectorAdvisory("pi/smol", "smol", catalog)).toMatch(/itself/);
    expect(selectorAdvisory("pi/smol", "tiny", catalog)).toBeNull();
    expect(selectorAdvisory("mystery/model", null, catalog)).toMatch(/Not in this host's catalog/);
    expect(selectorAdvisory("openrouter/*", null, catalog)).toBeNull();
    // No catalog knowledge → nothing to advise.
    expect(selectorAdvisory("mystery/model", null, new Set())).toBeNull();
  });
});

describe("known roles", () => {
  it("lists built-ins first, then customs from cycle and assignments once", () => {
    const roles = knownRoleIds(
      { "Opus 4.6": "anthropic/claude-opus-4-6", default: "x/y" },
      ["Fable 5", "default", "Opus 4.6"],
    );
    expect(roles.slice(0, BUILTIN_ROLES.length)).toEqual(BUILTIN_ROLES.map((role) => role.id));
    expect(roles.slice(BUILTIN_ROLES.length)).toEqual(["Fable 5", "Opus 4.6"]);
  });
});

describe("override chains", () => {
  it("parses ordered comma chains and round-trips them", () => {
    const entries = parseChain(CHAIN);
    expect(entries).toEqual(["google/gemini-3-pro", "openrouter/moonshotai/kimi-k2.7"]);
    expect(serializeChain(entries)).toBe("google/gemini-3-pro,openrouter/moonshotai/kimi-k2.7");
    expect(parseChain(serializeChain(entries))).toEqual(entries);
    expect(parseChain("one/model")).toEqual(["one/model"]);
    expect(parseChain(" , ,a/b, ")).toEqual(["a/b"]);
  });

  it("reorders chains without losing entries", () => {
    const chain = ["a/1", "b/2", "c/3"] as const;
    expect(moveItem(chain, 0, 1)).toEqual(["b/2", "a/1", "c/3"]);
    expect(moveItem(chain, 2, -1)).toEqual(["a/1", "c/3", "b/2"]);
    expect(moveItem(chain, 0, -1)).toEqual(chain);
    expect(moveItem(chain, 2, 1)).toEqual(chain);
  });
});

// ─── Staging through the real store ─────────────────────────────────────────

describe("role staging over the live-built catalog", () => {
  it("adapts wire role rows to editable map/list controls", () => {
    const catalog = builtCatalog();
    const store = createSettingsStore(catalog, localController(catalog));
    const vm = store.getState().viewModel;
    expect(vm.rowsById.get("modelRoles")?.control.kind).toBe("map");
    expect(vm.rowsById.get("cycleOrder")?.control.kind).toBe("list");
    const roles = recordValue(vm.rowsById.get("modelRoles")?.effective?.value);
    expect(roles?.default).toBe("anthropic/claude-fable-5:high");
  });

  it("stages role edit, add, and remove as one modelRoles draft and saves", async () => {
    const catalog = builtCatalog();
    const store = createSettingsStore(catalog, localController(catalog));
    const row = store.getState().viewModel.rowsById.get("modelRoles");
    expect(row).toBeDefined();
    if (row === undefined) return;
    const current = recordValue(draftedValue(row, "global", undefined));
    expect(current).not.toBeNull();
    if (current === null) return;

    // Edit one role, add a custom role, remove another — one staged record.
    const { smol: _dropped, ...withoutSmol } = current;
    const next = { ...withoutSmol, default: "xai-oauth/grok-4.5:high", "Fable 5": "anthropic/claude-fable-5" };
    store.getState().stageValue("modelRoles", next);
    expect(store.getState().drafts.modelRoles?.value).toEqual(next);
    expect(store.getState().draftErrors.modelRoles).toBeUndefined();

    await store.getState().save();
    const saved = recordValue(store.getState().viewModel.rowsById.get("modelRoles")?.layers.global?.value);
    expect(saved).toEqual(next);
    expect(saved?.smol).toBeUndefined();
    expect(store.getState().drafts).toEqual({});
  });

  it("stages cycle reorder and add/remove, preserving order", async () => {
    const catalog = builtCatalog();
    const store = createSettingsStore(catalog, localController(catalog));
    const row = store.getState().viewModel.rowsById.get("cycleOrder");
    if (row === undefined) return;
    const cycle = listValue(draftedValue(row, "global", undefined));
    expect(cycle).toEqual(["smol", "default", "slow"]);
    if (cycle === null) return;

    const reordered = moveItem(cycle, 0, 2);
    store.getState().stageValue("cycleOrder", [...reordered, "Opus 4.6"]);
    await store.getState().save();
    expect(store.getState().viewModel.rowsById.get("cycleOrder")?.layers.global?.value).toEqual([
      "default",
      "slow",
      "smol",
      "Opus 4.6",
    ]);
  });

  it("edits one agent's chain without rewriting other overrides", async () => {
    const catalog = builtCatalog();
    const store = createSettingsStore(catalog, localController(catalog));
    const row = store.getState().viewModel.rowsById.get("task.agentModelOverrides");
    if (row === undefined) return;
    const overrides = recordValue(draftedValue(row, "global", undefined));
    if (overrides === null) return;

    // The untouched gemini-executor chain stays byte-identical.
    const next = { ...overrides, scout: serializeChain(["anthropic/claude-fable-5", "google/gemini-3-flash"]) };
    store.getState().stageValue("task.agentModelOverrides", next);
    await store.getState().save();
    const saved = recordValue(
      store.getState().viewModel.rowsById.get("task.agentModelOverrides")?.layers.global?.value,
    );
    expect(saved?.["gemini-executor"]).toBe(CHAIN);
    expect(parseChain(saved?.scout ?? "")).toEqual(["anthropic/claude-fable-5", "google/gemini-3-flash"]);
  });

  it("stages disable and re-enable through task.disabledAgents", async () => {
    const catalog = builtCatalog();
    const store = createSettingsStore(catalog, localController(catalog));
    store.getState().stageValue("task.disabledAgents", ["scribe", "scout"]);
    await store.getState().save();
    expect(store.getState().viewModel.rowsById.get("task.disabledAgents")?.layers.global?.value).toEqual([
      "scribe",
      "scout",
    ]);

    // Re-enable scribe: filter it back out.
    store.getState().stageValue("task.disabledAgents", ["scout"]);
    await store.getState().save();
    expect(store.getState().viewModel.rowsById.get("task.disabledAgents")?.layers.global?.value).toEqual(["scout"]);
  });

  it("recovers from a CAS conflict without losing role drafts", async () => {
    const catalog = builtCatalog();
    const revised = applyChangesToCatalog(
      catalog,
      [{ id: "cycleOrder", scope: "global", action: "set", value: ["default"] }],
      "rev-2",
    );
    const store = createSettingsStore(catalog, localController(catalog, { conflictWith: revised }));
    const draft = { default: "xai-oauth/grok-4.5" };
    store.getState().stageValue("modelRoles", draft);
    await store.getState().save();

    // Conflict raised; the draft survived.
    expect(store.getState().incoming?.revision).toBe("rev-2");
    expect(store.getState().drafts.modelRoles?.value).toEqual(draft);

    // Load the host's latest: the host's cycle change is visible, the role
    // draft is still staged, and a second save applies it over rev-2.
    store.getState().loadIncoming();
    expect(store.getState().viewModel.rowsById.get("cycleOrder")?.layers.global?.value).toEqual(["default"]);
    expect(store.getState().drafts.modelRoles?.value).toEqual(draft);
    await store.getState().save();
    expect(store.getState().drafts).toEqual({});
    expect(
      recordValue(store.getState().viewModel.rowsById.get("modelRoles")?.layers.global?.value)?.default,
    ).toBe("xai-oauth/grok-4.5");
  });
});
