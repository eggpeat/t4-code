// Binding model for the live settings screen. It owns the store lifecycle
// that LiveSettingsScreen renders: resolve the active host, build the store
// as soon as BOTH live frames exist — no matter when they arrive relative to
// mount — feed newer host revisions into the store, and turn silence or
// broken payloads into named states instead of an eternal spinner. Pure
// TypeScript over the runtime port so every transition is testable headless.
import type { DesktopRuntimeSnapshot } from "@t4-code/client";
import { hostId as brandHostId } from "@t4-code/protocol";

import {
  agentChoicesFromCatalog,
  buildLiveSettingsCatalog,
  modelChoicesFromCatalog,
  type AgentCatalog,
  type ModelChoice,
} from "./live-catalog.ts";
import {
  createLiveSettingsController,
  type LiveSettingsRuntimePort,
  type SaveChallenge,
} from "./live-controller.ts";
import { createSettingsStore, type SettingsStoreApi } from "./settings-store.ts";

export interface ActiveHost {
  readonly targetId: string;
  readonly hostId: string;
  readonly hostLabel: string;
  readonly isLocal: boolean;
}

/** Why the screen is not showing settings yet. Every value is renderable. */
export type SettingsWaitDetail =
  /** No host is configured or connected at all. */
  | "no-host"
  /** A candidate target is actively connecting. */
  | "connecting"
  /** Connected, but the host has not published catalog+settings frames. */
  | "not-published";

export type LiveSettingsScreenState =
  | { readonly phase: "waiting"; readonly detail: SettingsWaitDetail; readonly hostLabel: string | null }
  | { readonly phase: "error"; readonly message: string; readonly hostLabel: string | null }
  | {
      readonly phase: "ready";
      readonly api: SettingsStoreApi;
      readonly active: ActiveHost;
      readonly models: readonly ModelChoice[];
      readonly agents: AgentCatalog;
    };

export interface LiveSettingsScreenModel {
  getState(): LiveSettingsScreenState;
  /** First subscriber attaches the runtime subscription; the last one
   * leaving detaches it, so React StrictMode's mount/unmount/mount cycle
   * (and any re-mount) is safe without an explicit dispose. */
  subscribe(listener: () => void): () => void;
}

export interface LiveSettingsScreenModelOptions {
  readonly runtime: LiveSettingsRuntimePort;
  readonly onChallenge: (challenge: SaveChallenge) => Promise<"approve" | "deny">;
  /** How long a connected-but-silent host may stay silent before the screen
   * says so as an error instead of spinning. */
  readonly publishTimeoutMs?: number;
}

const DEFAULT_PUBLISH_TIMEOUT_MS = 15_000;

/** The connected target whose host settings should open against: local
 * first, else the first connected target with a bound host. */
export function resolveActiveHost(snapshot: DesktopRuntimeSnapshot): ActiveHost | null {
  const candidates: string[] = [];
  if (snapshot.targetHosts.has("local")) candidates.push("local");
  for (const targetId of snapshot.targetHosts.keys()) {
    if (targetId !== "local") candidates.push(targetId);
  }
  for (const targetId of candidates) {
    if (snapshot.connections.get(targetId) !== "connected") continue;
    const hostId = snapshot.targetHosts.get(targetId);
    if (hostId === undefined) continue;
    const label = snapshot.targets.get(targetId)?.label ?? hostId;
    return { targetId, hostId, hostLabel: label, isLocal: targetId === "local" };
  }
  return null;
}

/** The most useful thing to say when no candidate target is connected. */
function connectionProblem(snapshot: DesktopRuntimeSnapshot): { detail: SettingsWaitDetail; error: string | null; label: string | null } {
  let connecting: string | null = null;
  for (const [targetId, target] of snapshot.targets) {
    const state = snapshot.connections.get(targetId) ?? target.state;
    if (state === "error") {
      const runtimeError = [...snapshot.runtimeErrors].reverse().find((entry) => entry.targetId === targetId);
      const reason = runtimeError === undefined ? "" : ` ${runtimeError.message}`;
      return { detail: "no-host", error: `The connection to ${target.label} failed.${reason}`, label: target.label };
    }
    if (state === "pairing-required") {
      return { detail: "no-host", error: `${target.label} needs pairing before its settings can load.`, label: target.label };
    }
    if (state === "connecting") connecting = target.label;
  }
  if (connecting !== null) return { detail: "connecting", error: null, label: connecting };
  return { detail: "no-host", error: null, label: null };
}

export function createLiveSettingsScreenModel(options: LiveSettingsScreenModelOptions): LiveSettingsScreenModel {
  const { runtime, onChallenge } = options;
  const publishTimeoutMs = options.publishTimeoutMs ?? DEFAULT_PUBLISH_TIMEOUT_MS;

  const listeners = new Set<() => void>();
  let state: LiveSettingsScreenState = { phase: "waiting", detail: "no-host", hostLabel: null };
  let store: { key: string; api: SettingsStoreApi } | null = null;
  let settingsRevision = "";
  let catalogRevision = "";
  let publishTimer: ReturnType<typeof setTimeout> | null = null;
  let publishNudgedKey: string | null = null;
  let publishTimedOutKey: string | null = null;

  function setState(next: LiveSettingsScreenState): void {
    // waiting/error states are value-comparable; ready changes are driven by
    // identity of the store and choice arrays.
    if (
      state.phase === next.phase &&
      ((state.phase === "waiting" && next.phase === "waiting" && state.detail === next.detail && state.hostLabel === next.hostLabel) ||
        (state.phase === "error" && next.phase === "error" && state.message === next.message) ||
        (state.phase === "ready" &&
          next.phase === "ready" &&
          state.api === next.api &&
          state.models === next.models &&
          state.agents === next.agents))
    ) {
      return;
    }
    state = next;
    for (const listener of listeners) listener();
  }

  function clearPublishTimer(): void {
    if (publishTimer !== null) {
      clearTimeout(publishTimer);
      publishTimer = null;
    }
  }

  /** Connected host, frames missing: nudge once, and bound the wait. */
  function awaitPublish(active: ActiveHost, key: string): void {
    if (publishTimedOutKey === key) {
      setState({
        phase: "error",
        message: `${active.hostLabel} is connected but hasn't published its settings. The host may be running an OMP build without desktop settings support.`,
        hostLabel: active.hostLabel,
      });
      return;
    }
    if (publishNudgedKey !== key) {
      publishNudgedKey = key;
      // Best effort: ask the host to (re)publish. Failures fall through to
      // the timeout below, which reports honestly.
      const wireHostId = brandHostId(active.hostId);
      void runtime.command(active.targetId, { hostId: wireHostId, command: "settings.read", args: {} }).catch(() => {});
      void runtime.command(active.targetId, { hostId: wireHostId, command: "catalog.get", args: {} }).catch(() => {});
      clearPublishTimer();
      publishTimer = setTimeout(() => {
        publishTimer = null;
        publishTimedOutKey = key;
        evaluate();
      }, publishTimeoutMs);
    }
    setState({ phase: "waiting", detail: "not-published", hostLabel: active.hostLabel });
  }

  let readyModels: readonly ModelChoice[] = [];
  let readyAgents: AgentCatalog = { agents: [], unavailableReason: null };

  function evaluate(): void {
    const snapshot = runtime.getSnapshot();
    const active = resolveActiveHost(snapshot);

    if (active === null) {
      clearPublishTimer();
      publishNudgedKey = null;
      const problem = connectionProblem(snapshot);
      if (problem.error !== null) {
        setState({ phase: "error", message: problem.error, hostLabel: problem.label });
      } else {
        setState({ phase: "waiting", detail: problem.detail, hostLabel: problem.label });
      }
      return;
    }

    const key = `${active.targetId}\u0000${active.hostId}`;
    const catalogFrame = snapshot.catalogs.get(active.hostId);
    const settingsFrame = snapshot.settings.get(active.hostId);

    if (catalogFrame === undefined || settingsFrame === undefined) {
      if (store?.key === key) {
        // Frames vanished mid-flight (reconnect); keep the store and wait.
        setState({ phase: "waiting", detail: "not-published", hostLabel: active.hostLabel });
        return;
      }
      store = null;
      awaitPublish(active, key);
      return;
    }

    clearPublishTimer();
    publishNudgedKey = null;
    publishTimedOutKey = null;

    if (store?.key !== key) {
      let api: SettingsStoreApi;
      try {
        const built = buildLiveSettingsCatalog({
          catalog: catalogFrame,
          settings: settingsFrame,
          hostLabel: active.hostLabel,
        });
        const controller = createLiveSettingsController({
          runtime,
          targetId: active.targetId,
          hostId: active.hostId,
          hostLabel: active.hostLabel,
          onChallenge,
        });
        api = createSettingsStore(built.catalog, controller);
        settingsRevision = built.catalog.revision;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        setState({
          phase: "error",
          message: `${active.hostLabel} sent settings this app can't display safely. ${detail}`.slice(0, 400),
          hostLabel: active.hostLabel,
        });
        return;
      }
      store = { key, api };
      catalogRevision = "";
    } else if (
      String(settingsFrame.revision) !== settingsRevision &&
      !store.api.getState().saving
    ) {
      // A newer host revision landed outside a save: rebase (the store keeps
      // drafts and raises its conflict banner when dirty).
      try {
        const built = buildLiveSettingsCatalog({
          catalog: catalogFrame,
          settings: settingsFrame,
          hostLabel: active.hostLabel,
        });
        settingsRevision = built.catalog.revision;
        store.api.getState().ingestCatalog(built.catalog);
      } catch {
        // A malformed push must not eat the working screen; skip this
        // revision and keep what the user has.
        settingsRevision = String(settingsFrame.revision);
      }
    }

    if (String(catalogFrame.revision) !== catalogRevision) {
      catalogRevision = String(catalogFrame.revision);
      readyModels = modelChoicesFromCatalog(catalogFrame);
      readyAgents = agentChoicesFromCatalog(catalogFrame);
    }

    setState({ phase: "ready", api: store.api, active, models: readyModels, agents: readyAgents });
  }

  // Initial state without a runtime subscription; subscribers attach it.
  evaluate();
  let detachRuntime: (() => void) | null = null;

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      if (detachRuntime === null) {
        detachRuntime = runtime.subscribe(() => evaluate());
        evaluate();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && detachRuntime !== null) {
          detachRuntime();
          detachRuntime = null;
          clearPublishTimer();
          publishNudgedKey = null;
        }
      };
    },
  };
}
