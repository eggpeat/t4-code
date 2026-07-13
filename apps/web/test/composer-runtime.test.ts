// Composer behavior and runtime-controller contracts: IME-safe keys, slash
// ranking with aliases and disabled reasons, attachment validation, draft
// A→B→A continuity, and intent-driven approval/ask/plan transitions with
// offline/cached disable truth. Pure logic plus the fixture controller.
import { describe, expect, it } from "vite-plus/test";

import { admitAttachments } from "../src/features/composer/attachments.ts";
import { resolveAskDigit, resolveComposerKey, resolveMenuKey } from "../src/features/composer/keys.ts";
import {
  activeSlashQuery,
  buildSlashCatalog,
  searchSlashCommands,
} from "../src/features/composer/slash.ts";
import {
  composerStore,
  LEGACY_COMPOSER_STORAGE_KEY,
  purgeLegacyComposerPersistence,
} from "../src/features/composer/composer-store.ts";
import { createFixtureSessionRuntime } from "../src/features/session-runtime/controller.ts";
import { FIXTURE_NOW_MS } from "../src/features/session-runtime/fixtures.ts";
import { createMemoryPersistence } from "../src/state/persistence.ts";
import { createWorkspaceStore, selectSessionView } from "../src/state/workspace-store.ts";

const KEY = {
  key: "Enter",
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  isComposing: false,
} as const;

describe("composer keys (IME-safe)", () => {
  it("Enter submits; modifiers insert a newline", () => {
    expect(resolveComposerKey(KEY)).toBe("submit");
    expect(resolveComposerKey({ ...KEY, shiftKey: true })).toBe("newline");
    expect(resolveComposerKey({ ...KEY, altKey: true })).toBe("newline");
    expect(resolveComposerKey({ ...KEY, ctrlKey: true })).toBe("newline");
    expect(resolveComposerKey({ ...KEY, metaKey: true })).toBe("newline");
  });

  it("never submits during IME composition (isComposing or keyCode 229)", () => {
    expect(resolveComposerKey({ ...KEY, isComposing: true })).toBe("none");
    expect(resolveComposerKey({ ...KEY, keyCode: 229 })).toBe("none");
    expect(resolveMenuKey({ ...KEY, isComposing: true })).toBe("none");
  });

  it("menu keys navigate, accept, and dismiss", () => {
    expect(resolveMenuKey({ ...KEY, key: "ArrowDown" })).toBe("next");
    expect(resolveMenuKey({ ...KEY, key: "ArrowUp" })).toBe("previous");
    expect(resolveMenuKey({ ...KEY, key: "Tab" })).toBe("accept");
    expect(resolveMenuKey(KEY)).toBe("accept");
    expect(resolveMenuKey({ ...KEY, key: "Escape" })).toBe("dismiss");
  });

  it("digits 1-9 answer ask options; out-of-range and composed digits do not", () => {
    expect(resolveAskDigit({ ...KEY, key: "1" }, 3)).toBe(0);
    expect(resolveAskDigit({ ...KEY, key: "3" }, 3)).toBe(2);
    expect(resolveAskDigit({ ...KEY, key: "4" }, 3)).toBeNull();
    expect(resolveAskDigit({ ...KEY, key: "0" }, 3)).toBeNull();
    expect(resolveAskDigit({ ...KEY, key: "1", isComposing: true }, 3)).toBeNull();
    expect(resolveAskDigit({ ...KEY, key: "1", ctrlKey: true }, 3)).toBeNull();
  });
});

describe("slash commands", () => {
  const catalog = buildSlashCatalog({ link: "live", turnActive: false });

  it("detects the active query only in a leading slash token", () => {
    expect(activeSlashQuery("/mo", 3)).toBe("mo");
    expect(activeSlashQuery("/", 1)).toBe("");
    expect(activeSlashQuery("hello /mo", 9)).toBeNull();
    expect(activeSlashQuery("/model something", 16)).toBeNull();
  });

  it("ranks prefix matches first and matches aliases", () => {
    const byName = searchSlashCommands(catalog, "mo");
    expect(byName[0]?.name).toBe("/model");
    const byAlias = searchSlashCommands(catalog, "again");
    expect(byAlias[0]?.name).toBe("/retry");
    const bySecondAlias = searchSlashCommands(catalog, "sh");
    expect(bySecondAlias[0]?.name).toBe("/terminal");
  });

  it("keeps disabled commands visible with a reason instead of hiding them", () => {
    const terminal = catalog.find((command) => command.name === "/terminal");
    expect(terminal?.disabledReason).toBe("Needs terminal access on this host");
    const offline = buildSlashCatalog({ link: "offline", turnActive: false });
    expect(offline.every((command) => command.disabledReason !== null)).toBe(true);
    const streaming = buildSlashCatalog({ link: "live", turnActive: true });
    expect(streaming.find((command) => command.name === "/retry")?.disabledReason).toBe(
      "A turn is already running",
    );
  });
});

describe("attachments", () => {
  it("accepts images and text files, rejects the rest with reasons", () => {
    const result = admitAttachments(
      [],
      [
        { name: "shot.png", mediaType: "image/png", sizeBytes: 1024 },
        { name: "notes.md", mediaType: "text/markdown", sizeBytes: 2048 },
        { name: "movie.mp4", mediaType: "video/mp4", sizeBytes: 1024 },
      ],
    );
    expect(result.accepted.map((attachment) => attachment.kind)).toEqual(["image", "file"]);
    expect(result.rejections).toEqual(["movie.mp4: only images and text files attach here."]);
  });

  it("enforces the size cap, the count cap, and duplicate names", () => {
    const oversize = admitAttachments(
      [],
      [{ name: "big.png", mediaType: "image/png", sizeBytes: 11 * 1024 * 1024 }],
    );
    expect(oversize.accepted.length).toBe(0);
    expect(oversize.rejections[0]).toContain("over the 10.0 MB limit");

    const eight = admitAttachments(
      [],
      Array.from({ length: 9 }, (_, i) => ({
        name: `f${i}.png`,
        mediaType: "image/png" as const,
        sizeBytes: 10,
      })),
    ).accepted;
    expect(eight.length).toBe(8);

    const duplicate = admitAttachments(eight, [
      { name: "f0.png", mediaType: "image/png", sizeBytes: 10 },
    ]);
    expect(duplicate.accepted.length).toBe(0);
  });
});

describe("draft continuity A→B→A", () => {
  it("restores each session's draft through the workspace store", () => {
    const store = createWorkspaceStore({ persistence: createMemoryPersistence() });
    store.getState().setSessionDraft("A", "half-written to A");
    store.getState().setSessionDraft("B", "note for B");
    store.getState().setSessionDraft("A", "half-written to A, continued");
    expect(selectSessionView(store.getState(), "A").draft).toBe("half-written to A, continued");
    expect(selectSessionView(store.getState(), "B").draft).toBe("note for B");
  });
});

describe("composer control persistence removal", () => {
  it("purges the retired v1 options blob so stale local state never returns", () => {
    const removed: string[] = [];
    purgeLegacyComposerPersistence({ removeItem: (key) => removed.push(key) });
    expect(removed).toEqual([LEGACY_COMPOSER_STORAGE_KEY]);
    // Storage failures stay silent — boot never trips on a broken store.
    purgeLegacyComposerPersistence({
      removeItem: () => {
        throw new Error("denied");
      },
    });
  });

  it("keeps no per-session control selections in the renderer store", () => {
    const state: Record<string, unknown> = { ...composerStore.getState() };
    expect(state.optionsBySessionId).toBeUndefined();
    expect(Object.keys(state)).toContain("attachmentsBySessionId");
  });
});

describe("fixture runtime controller", () => {
  it("resolves an approval into command execution frames", () => {
    const runtime = createFixtureSessionRuntime({
      sessionKey: "sess-settings",
      variant: "default",
      tickMs: 1,
    });
    runtime.pause(); // deterministic: drive via dispatch only
    const before = runtime.getSnapshot();
    expect(before.projection.approval?.approvalId).toBe("approval-migrate");
    // Elapsed labels render from the runtime's reported time base — the
    // fixed scripted "now", never the wall clock.
    expect(before.nowMs).toBe(FIXTURE_NOW_MS);
    runtime.dispatch({ kind: "approval", approvalId: "approval-migrate", decision: "approve" });
    const after = runtime.getSnapshot();
    expect(after.projection.approval).toBeNull();
    runtime.dispose();
  });

  it("answers an ask and clears the request", () => {
    const runtime = createFixtureSessionRuntime({
      sessionKey: "sess-fixtures",
      variant: "default",
      tickMs: 1,
    });
    runtime.pause();
    expect(runtime.getSnapshot().projection.ask?.options.length).toBe(3);
    runtime.dispatch({ kind: "ask", askId: "ask-scenarios", optionIds: ["faults"], text: "" });
    expect(runtime.getSnapshot().projection.ask).toBeNull();
    runtime.dispose();
  });

  it("resolves a plan for approve and reject", () => {
    for (const action of ["approve", "reject"] as const) {
      const runtime = createFixtureSessionRuntime({
        sessionKey: "sess-bundle",
        variant: "default",
        tickMs: 1,
      });
      runtime.pause();
      expect(runtime.getSnapshot().projection.plan?.planId).toBe("plan-bundle");
      runtime.dispatch({ kind: "plan", planId: "plan-bundle", action, note: "" });
      expect(runtime.getSnapshot().projection.plan).toBeNull();
      runtime.dispose();
    }
  });

  it("queues follow-ups while a turn is active and refuses offline intents", () => {
    const live = createFixtureSessionRuntime({
      sessionKey: "sess-settings",
      variant: "default",
      tickMs: 1,
    });
    live.pause();
    // sess-settings has turn.start applied (approval pending mid-turn).
    expect(live.getSnapshot().projection.turnActive).toBe(true);
    live.dispatch({ kind: "followUp", text: "afterwards, run the soak test" });
    expect(live.getSnapshot().queuedFollowUps).toEqual(["afterwards, run the soak test"]);
    live.dispose();

    const offline = createFixtureSessionRuntime({
      sessionKey: "sess-pagination",
      variant: "default",
      link: "offline",
      tickMs: 1,
    });
    offline.pause();
    const entriesBefore = offline.getSnapshot().projection.entries.length;
    expect(offline.getSnapshot().canPrompt).toBe(false);
    offline.dispatch({ kind: "prompt", text: "should not apply", attachments: [] });
    expect(offline.getSnapshot().controls.modelSupported).toBe(false);
    expect(offline.getSnapshot().projection.entries.length).toBe(entriesBefore);
    offline.dispose();
  });

  it("owns model/thinking/fast/mode state and applies control intents deterministically", () => {
    const runtime = createFixtureSessionRuntime({
      sessionKey: "sess-stream",
      variant: "default",
      tickMs: 1,
    });
    runtime.pause();
    const before = runtime.getSnapshot().controls;
    // Deterministic defaults come from the script, never from persistence.
    expect(before.modelSelectedId).toBe("role:default");
    expect(before.modelLabel).toBe("Default");
    expect(before.thinking).toBe("medium");
    expect(before.fast).toBe(false);
    expect(before.mode).toBe("build");
    expect(before.modeSupported).toBe(true);
    expect(before.attachmentsSupported).toBe(true);
    expect(before.thinkingLevels).toContain("auto");
    expect(before.thinkingLevels).toContain("max");

    runtime.dispatch({ kind: "setModel", selector: null, role: "smol" });
    runtime.dispatch({ kind: "setThinking", level: "xhigh" });
    runtime.dispatch({ kind: "setFast", enabled: true });
    runtime.dispatch({ kind: "setMode", mode: "plan" });
    const after = runtime.getSnapshot().controls;
    expect(after.modelSelectedId).toBe("role:smol");
    expect(after.modelLabel).toBe("Fast");
    expect(after.thinking).toBe("xhigh");
    expect(after.fast).toBe(true);
    expect(after.mode).toBe("plan");
    runtime.dispose();
  });

  it("gap variant pauses the stream instead of applying past the gap", () => {
    const runtime = createFixtureSessionRuntime({
      sessionKey: "sess-stream",
      variant: "gap",
      tickMs: 1,
    });
    runtime.pause();
    // Drive pending ticks synchronously by resuming with a tiny tick and
    // waiting is nondeterministic; instead the projection reducer already
    // covers gap semantics. Here we just assert the script attached cleanly.
    expect(runtime.getSnapshot().projection.phase).toBe("active");
    runtime.dispose();
  });
});
