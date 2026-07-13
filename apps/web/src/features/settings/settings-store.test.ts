// Store contract: staged edits, dirty tracking, reset-to-inherited, save,
// external-revision conflict, restart accounting, and the live-region
// announcements the workspace reads verbatim.
import { describe, expect, it } from "vite-plus/test";

import {
  createFixtureSettingsController,
  SETTINGS_CATALOG_FIXTURE,
  SETTINGS_CATALOG_REVISED_FIXTURE,
} from "./fixtures.ts";
import { createSettingsStore } from "./settings-store.ts";

function freshStore(options?: Parameters<typeof createFixtureSettingsController>[0]) {
  return createSettingsStore(SETTINGS_CATALOG_FIXTURE, createFixtureSettingsController(options));
}

describe("dirty tracking", () => {
  it("stages a change and un-stages when the stored value is typed back", () => {
    const store = freshStore();
    store.getState().stageValue("appearance.theme", "light");
    expect(store.getState().drafts["appearance.theme"]).toEqual({
      scope: "global",
      action: "set",
      value: "light",
    });
    store.getState().stageValue("appearance.theme", "dark");
    expect(store.getState().drafts["appearance.theme"]).toBeUndefined();
  });

  it("does not stage retyping an inherited value at a layer that never set it", () => {
    const store = freshStore();
    store.getState().setEditScope("session");
    // editor.command resolves to the project value at the session layer.
    store.getState().stageValue("editor.command", "code --wait");
    expect(store.getState().drafts["editor.command"]).toBeUndefined();
    store.getState().stageValue("editor.command", "nvim");
    expect(store.getState().drafts["editor.command"]?.value).toBe("nvim");
  });

  it("stages reset-to-inherited only where a layer value exists", () => {
    const store = freshStore();
    store.getState().stageClear("appearance.theme");
    expect(store.getState().drafts["appearance.theme"]).toEqual({ scope: "global", action: "clear" });
    // Nothing set at the project layer: clear is a no-op, not a change.
    store.getState().setEditScope("project");
    store.getState().stageClear("appearance.fontSize");
    expect(store.getState().drafts["appearance.fontSize"]).toBeUndefined();
  });

  it("tracks validation errors with drafts and clears them together", () => {
    const store = freshStore();
    store.getState().stageValue("terminal.scrollback", 5);
    expect(store.getState().draftErrors["terminal.scrollback"]).toMatch(/at least/);
    store.getState().discardAll();
    expect(store.getState().drafts).toEqual({});
    expect(store.getState().draftErrors).toEqual({});
    expect(store.getState().announcement).toBe("Changes discarded.");
  });

  it("refuses to edit unavailable settings", () => {
    const store = freshStore();
    store.getState().stageValue("power.sleepPrevention", "system");
    expect(store.getState().drafts).toEqual({});
  });
});

describe("save", () => {
  it("applies drafts, rebuilds the view model, and announces the result", async () => {
    const store = freshStore();
    store.getState().stageValue("appearance.theme", "light");
    store.getState().stageValue("notifications.sound", true);
    await store.getState().save();
    const state = store.getState();
    expect(state.drafts).toEqual({});
    expect(state.viewModel.rowsById.get("appearance.theme")?.effective).toEqual({
      value: "light",
      source: "global",
    });
    expect(state.announcement).toBe("Saved 2 settings.");
    expect(state.restartIds).toEqual([]);
  });

  it("records restart-required settings after a successful save", async () => {
    const store = freshStore();
    store.getState().stageValue("terminal.scrollback", 20000);
    await store.getState().save();
    expect(store.getState().restartIds).toEqual(["terminal.scrollback"]);
    store.getState().dismissRestart();
    expect(store.getState().restartIds).toEqual([]);
  });

  it("blocks saving while any draft is invalid", async () => {
    const store = freshStore();
    store.getState().stageValue("terminal.scrollback", 5);
    await store.getState().save();
    expect(store.getState().announcement).toBe("Not saved. One field needs attention.");
    expect(store.getState().drafts["terminal.scrollback"]).toBeDefined();
  });

  it("surfaces host rejection verbatim", async () => {
    const store = freshStore({ rejectWith: "The config file is read-only." });
    store.getState().stageValue("appearance.theme", "light");
    await store.getState().save();
    expect(store.getState().announcement).toBe("Not saved. The config file is read-only.");
  });
});

describe("external revision conflict", () => {
  it("keeps drafts and raises the conflict when the host saved first", async () => {
    const store = freshStore({ conflictOnFirstSave: true });
    store.getState().stageValue("notifications.sound", true);
    await store.getState().save();
    const state = store.getState();
    expect(state.incoming?.revision).toBe("rev-8");
    expect(state.drafts["notifications.sound"]).toBeDefined();
    expect(state.announcement).toBe("Not saved. These settings changed on the host first.");
  });

  it("load-latest rebases to the incoming catalog without losing drafts", async () => {
    const store = freshStore({ conflictOnFirstSave: true });
    store.getState().stageValue("notifications.sound", true);
    await store.getState().save();
    store.getState().loadIncoming();
    const state = store.getState();
    expect(state.incoming).toBeNull();
    // The host's own change is now visible…
    expect(state.viewModel.rowsById.get("appearance.theme")?.effective?.value).toBe("light");
    // …and the user's staged edit survived.
    expect(state.drafts["notifications.sound"]).toBeDefined();
  });

  it("save-mine-anyway applies drafts over the incoming revision", async () => {
    const store = freshStore({ conflictOnFirstSave: true });
    store.getState().stageValue("notifications.sound", true);
    await store.getState().save();
    await store.getState().saveOverIncoming();
    const state = store.getState();
    expect(state.incoming).toBeNull();
    expect(state.drafts).toEqual({});
    expect(state.viewModel.rowsById.get("notifications.sound")?.effective).toEqual({
      value: true,
      source: "global",
    });
    expect(state.announcement).toBe("Saved 1 setting.");
  });

  it("a host push replaces quietly when clean and raises the banner when dirty", () => {
    const clean = freshStore();
    clean.getState().ingestCatalog(SETTINGS_CATALOG_REVISED_FIXTURE);
    expect(clean.getState().incoming).toBeNull();
    expect(clean.getState().viewModel.revision).toBe("rev-8");

    const dirty = freshStore();
    dirty.getState().stageValue("notifications.sound", true);
    dirty.getState().ingestCatalog(SETTINGS_CATALOG_REVISED_FIXTURE);
    expect(dirty.getState().incoming?.revision).toBe("rev-8");
    expect(dirty.getState().viewModel.revision).toBe("rev-7");
  });
});
