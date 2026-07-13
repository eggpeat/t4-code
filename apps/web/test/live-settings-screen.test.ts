// Live settings screen binding: the store is created whenever catalog and
// settings frames BOTH exist — including when they land after mount (the
// memoized-null regression) — newer revisions rebase the same store,
// connection and publish failures become named error states instead of an
// eternal spinner, a full 410-path catalog renders with sensitive names but
// never values, model/agent choices come from the live catalog, and the
// scope surfaces never call the host-process runtime override a "session".
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vite-plus/test";

import type { CatalogFrame, SettingsFrame } from "@t4-code/protocol";
import type {
  CommandRequest,
  CommandResult,
  ConfirmRequest,
  ConfirmResult,
  RendererServerFrameEvent,
} from "@t4-code/protocol/desktop-ipc";

import type { LiveSettingsRuntimePort } from "../src/features/settings/live-controller.ts";
import {
  createLiveSettingsScreenModel,
  type LiveSettingsScreenState,
} from "../src/features/settings/live-screen-model.ts";
import { SCOPE_LABEL } from "../src/features/settings/SettingRow.tsx";
import { SCOPE_TAB_LABEL } from "../src/features/settings/SettingsWorkspace.tsx";

const SETTINGS_SRC = join(import.meta.dirname, "../src/features/settings");

// ─── Frame builders ─────────────────────────────────────────────────────────

function settingItem(path: string, metadata: Record<string, unknown>): Record<string, unknown> {
  return { id: `setting:${path}`, kind: "setting", name: path, metadata: { path, ...metadata } };
}

function plainItem(path: string): Record<string, unknown> {
  return settingItem(path, {
    label: `Setting ${path}`,
    controlType: "boolean",
    default: false,
    effectiveSource: "default",
    configured: false,
    sensitive: false,
  });
}

function sensitiveItem(path: string): Record<string, unknown> {
  return settingItem(path, {
    label: `Key ${path}`,
    controlType: "string",
    effectiveSource: "global",
    configured: true,
    sensitive: true,
  });
}

// Test seam: fixture frames are hand-built rather than wire-decoded.
function catalogFrame(items: readonly Record<string, unknown>[], revision = "rev-1"): CatalogFrame {
  return { v: "omp-app/1", type: "catalog", hostId: "host-1", revision, items } as unknown as CatalogFrame;
}

function settingsFrame(revision = "rev-1", settings: Record<string, unknown> = {}): SettingsFrame {
  return { v: "omp-app/1", type: "settings", hostId: "host-1", revision, settings } as unknown as SettingsFrame;
}

// ─── Fake runtime ───────────────────────────────────────────────────────────

interface MutableSnapshot {
  targets: Map<string, { targetId: string; label: string; state: string }>;
  connections: Map<string, string>;
  targetHosts: Map<string, string>;
  catalogs: Map<string, CatalogFrame>;
  settings: Map<string, SettingsFrame>;
  runtimeErrors: { targetId?: string; code: string; message: string }[];
}

class FakeRuntime implements LiveSettingsRuntimePort {
  readonly commands: CommandRequest["intent"][] = [];
  readonly snapshot: MutableSnapshot = {
    targets: new Map(),
    connections: new Map(),
    targetHosts: new Map(),
    catalogs: new Map(),
    settings: new Map(),
    runtimeErrors: [],
  };
  private listeners = new Set<(snapshot: never) => void>();

  connectLocal(): void {
    this.snapshot.targets.set("local", { targetId: "local", label: "This computer", state: "connected" });
    this.snapshot.connections.set("local", "connected");
    this.snapshot.targetHosts.set("local", "host-1");
  }
  publish(catalog: CatalogFrame, settings: SettingsFrame): void {
    this.snapshot.catalogs.set("host-1", catalog);
    this.snapshot.settings.set("host-1", settings);
  }
  notify(): void {
    for (const listener of this.listeners) listener(this.getSnapshot());
  }
  // Test seam: only the fields the model reads exist on this snapshot.
  getSnapshot(): never {
    return this.snapshot as unknown as never;
  }
  subscribe(listener: (snapshot: never) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  subscribeFrames(
    _filter: { readonly targetId: string },
    _listener: (event: RendererServerFrameEvent) => void,
  ): () => void {
    return () => {};
  }
  async command(_targetId: string, intent: CommandRequest["intent"]): Promise<CommandResult> {
    this.commands.push(intent);
    return { targetId: "local", requestId: `req-${this.commands.length}`, commandId: "cmd", accepted: true };
  }
  async confirm(request: ConfirmRequest): Promise<ConfirmResult> {
    return {
      targetId: request.targetId,
      requestId: "req-confirm",
      confirmationId: request.confirmationId,
      commandId: request.commandId,
      accepted: true,
    };
  }
}

function attachedModel(runtime: FakeRuntime, publishTimeoutMs = 15_000) {
  const model = createLiveSettingsScreenModel({
    runtime,
    onChallenge: async () => "approve",
    publishTimeoutMs,
  });
  const detach = model.subscribe(() => {});
  return { model, detach };
}

const BASE_ITEMS = [
  settingItem("appearance.compact", {
    label: "Compact",
    controlType: "boolean",
    default: false,
    effective: true,
    effectiveSource: "global",
    configured: true,
    sensitive: false,
    tab: "appearance",
  }),
];

// ─── Late-frame recovery ────────────────────────────────────────────────────

describe("live settings screen model", () => {
  it("creates the store when frames arrive AFTER mount, not just at mount", () => {
    const runtime = new FakeRuntime();
    runtime.connectLocal();
    const { model } = attachedModel(runtime);

    // Connected, nothing published: an honest wait, plus a re-publish nudge.
    expect(model.getState()).toMatchObject({ phase: "waiting", detail: "not-published" });
    expect(runtime.commands.map((intent) => intent.command)).toEqual(["settings.read", "catalog.get"]);

    // The frames land late — this is the memoized-null regression.
    runtime.publish(catalogFrame(BASE_ITEMS), settingsFrame());
    runtime.notify();
    const state: LiveSettingsScreenState = model.getState();
    expect(state.phase).toBe("ready");
    if (state.phase !== "ready") return;
    expect(state.active).toMatchObject({ targetId: "local", hostId: "host-1", isLocal: true });
    expect(state.api.getState().viewModel.rowsById.get("appearance.compact")?.effective?.value).toBe(true);
  });

  it("feeds newer revisions into the SAME store instead of rebuilding it", () => {
    const runtime = new FakeRuntime();
    runtime.connectLocal();
    runtime.publish(catalogFrame(BASE_ITEMS), settingsFrame());
    const { model } = attachedModel(runtime);
    const first = model.getState();
    expect(first.phase).toBe("ready");
    if (first.phase !== "ready") return;

    runtime.publish(catalogFrame(BASE_ITEMS, "rev-2"), settingsFrame("rev-2"));
    runtime.notify();
    const second = model.getState();
    expect(second.phase).toBe("ready");
    if (second.phase !== "ready") return;
    expect(second.api).toBe(first.api);
    expect(second.api.getState().viewModel.revision).toBe("rev-2");
    expect(second.api.getState().announcement).toBe("Settings refreshed from the host.");
  });

  it("names a failed connection instead of spinning", () => {
    const runtime = new FakeRuntime();
    runtime.snapshot.targets.set("local", { targetId: "local", label: "This computer", state: "error" });
    runtime.snapshot.connections.set("local", "error");
    runtime.snapshot.targetHosts.set("local", "host-1");
    runtime.snapshot.runtimeErrors.push({ targetId: "local", code: "transport", message: "socket closed" });
    const { model } = attachedModel(runtime);
    const state = model.getState();
    expect(state.phase).toBe("error");
    if (state.phase !== "error") return;
    expect(state.message).toMatch(/connection to This computer failed/);
    expect(state.message).toMatch(/socket closed/);
  });

  it("names pairing-required instead of spinning", () => {
    const runtime = new FakeRuntime();
    runtime.snapshot.targets.set("mac", { targetId: "mac", label: "Work Mac", state: "pairing-required" });
    runtime.snapshot.connections.set("mac", "pairing-required");
    const { model } = attachedModel(runtime);
    expect(model.getState()).toMatchObject({ phase: "error", message: expect.stringMatching(/pairing/) });
  });

  it("escalates a connected-but-silent host to an error after the bound", () => {
    vi.useFakeTimers();
    try {
      const runtime = new FakeRuntime();
      runtime.connectLocal();
      const { model } = attachedModel(runtime, 5_000);
      expect(model.getState()).toMatchObject({ phase: "waiting", detail: "not-published" });
      vi.advanceTimersByTime(5_001);
      const state = model.getState();
      expect(state.phase).toBe("error");
      if (state.phase !== "error") return;
      expect(state.message).toMatch(/hasn't published its settings/);

      // Frames arriving after the timeout still recover the screen.
      runtime.publish(catalogFrame(BASE_ITEMS), settingsFrame());
      runtime.notify();
      expect(model.getState().phase).toBe("ready");
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports no host without a spinner state", () => {
    const runtime = new FakeRuntime();
    const { model } = attachedModel(runtime);
    expect(model.getState()).toMatchObject({ phase: "waiting", detail: "no-host" });
  });
});

// ─── Full-catalog rendering and sensitive hygiene ───────────────────────────

describe("full catalog rendering", () => {
  it("renders all 410 settings; sensitive paths keep their names, never values", () => {
    const sensitivePaths = Array.from({ length: 30 }, (_, at) => `providers.p${at}.apiKey`);
    const plainPaths = Array.from({ length: 380 }, (_, at) => `group${at % 12}.setting${at}`);
    const items = [...plainPaths.map(plainItem), ...sensitivePaths.map(sensitiveItem)];
    expect(items).toHaveLength(410);

    const runtime = new FakeRuntime();
    runtime.connectLocal();
    runtime.publish(catalogFrame(items), settingsFrame());
    const { model } = attachedModel(runtime);
    const state = model.getState();
    expect(state.phase).toBe("ready");
    if (state.phase !== "ready") return;

    const vm = state.api.getState().viewModel;
    expect(vm.rowsById.size).toBe(410);
    for (const path of sensitivePaths) {
      const row = vm.rowsById.get(path);
      expect(row?.control.kind).toBe("secret");
      expect(row?.sensitive).toBe(true);
    }
    // No effective/default/layer value anywhere on any sensitive row.
    const serialized = JSON.stringify([...vm.rowsById.values()].filter((row) => row.sensitive));
    expect(serialized).not.toMatch(/"value"/);
    expect(serialized).not.toMatch(/effective/);
  });

  it("derives model and agent choices from the live catalog only", () => {
    const items = [
      ...BASE_ITEMS,
      {
        id: "model:anthropic/claude-fable-5",
        kind: "model",
        name: "Claude Fable 5",
        metadata: { provider: "anthropic", modelId: "claude-fable-5", contextWindow: 200000 },
      },
      { id: "agent:scout", kind: "agent", name: "scout", description: "Explores the repo." },
      { id: "availability:agents", kind: "agent", name: "availability:agents", supported: false, reason: "off" },
    ];
    const runtime = new FakeRuntime();
    runtime.connectLocal();
    runtime.publish(catalogFrame(items), settingsFrame());
    const { model } = attachedModel(runtime);
    const state = model.getState();
    if (state.phase !== "ready") {
      expect(state.phase).toBe("ready");
      return;
    }
    expect(state.models).toEqual([
      { selector: "anthropic/claude-fable-5", label: "Claude Fable 5", provider: "anthropic", contextWindow: 200000 },
    ]);
    // A discovered agent wins over the registry-unavailable marker.
    expect(state.agents).toEqual({
      agents: [{ name: "scout", description: "Explores the repo." }],
      unavailableReason: null,
    });
  });
});

// ─── Honest scope labels ────────────────────────────────────────────────────

describe("honest scope labels", () => {
  it("labels the host-process override scope as a run, never a session", () => {
    expect(SCOPE_TAB_LABEL.session).toBe("This run");
    expect(SCOPE_TAB_LABEL.global).toBe("This machine");
    expect(SCOPE_LABEL.session).toBe("this run (until OMP restarts)");
    expect(SCOPE_LABEL.session).not.toMatch(/session/i);
    expect(SCOPE_TAB_LABEL.session).not.toMatch(/session/i);
  });

  it("keeps 'this session' out of every settings surface source", () => {
    const sources = readdirSync(SETTINGS_SRC).filter(
      (name) => (name.endsWith(".ts") || name.endsWith(".tsx")) && !name.endsWith(".test.ts"),
    );
    expect(sources.length).toBeGreaterThan(10);
    for (const name of sources) {
      const text = readFileSync(join(SETTINGS_SRC, name), "utf8");
      expect(text, `${name} still says "this session"`).not.toMatch(/[Tt]his session/);
    }
  });
});
