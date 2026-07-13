// Settings workspace state: staged edits over the host catalog. The catalog
// stays authoritative — drafts are the only renderer-owned truth, and they
// exist exactly until the host confirms a save. One store per workspace
// mount; the controller seam is the eventual `settings.write` wire path.
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";

import type {
  EditableScope,
  SettingsCatalogMetadata,
  SettingsChange,
  SettingsController,
  SettingValue,
} from "./schema.ts";
import {
  buildSettingsViewModel,
  type SettingsViewModel,
  validateDraft,
  valueAtScope,
} from "./view-model.ts";

/** One staged, not-yet-saved edit. `clear` restores the inherited value. */
export interface SettingDraft {
  readonly scope: EditableScope;
  readonly action: "set" | "clear";
  readonly value?: SettingValue;
}

export interface SettingsState {
  readonly viewModel: SettingsViewModel;
  readonly editScope: EditableScope;
  readonly drafts: Readonly<Record<string, SettingDraft>>;
  /** Validation messages for drafts that can't be saved as typed. */
  readonly draftErrors: Readonly<Record<string, string>>;
  readonly query: string;
  readonly activeSectionId: string;
  readonly saving: boolean;
  /** Screen-reader announcement for the save live region. */
  readonly announcement: string;
  /** Set while a newer host revision is waiting on the user's decision. */
  readonly incoming: SettingsCatalogMetadata | null;
  /** Saved setting ids whose changes wait for an OMP restart. */
  readonly restartIds: readonly string[];
}

export interface SettingsActions {
  setQuery(query: string): void;
  setActiveSection(sectionId: string): void;
  setEditScope(scope: EditableScope): void;
  /** Stage a value at the current edit layer; equal-to-stored removes the draft. */
  stageValue(id: string, value: SettingValue): void;
  /** Stage removal of this layer's value so the broader layer shows through. */
  stageClear(id: string): void;
  discardDraft(id: string): void;
  discardAll(): void;
  save(): Promise<void>;
  /** A newer catalog arrived outside a save (host watch). */
  ingestCatalog(catalog: SettingsCatalogMetadata): void;
  /** Conflict decision: adopt the host's latest values, keep drafts staged. */
  loadIncoming(): void;
  /** Conflict decision: adopt latest, then immediately save the drafts over it. */
  saveOverIncoming(): Promise<void>;
  dismissRestart(): void;
}

export type SettingsStoreApi = StoreApi<SettingsState & SettingsActions>;

function valueEquals(a: SettingValue | undefined, b: SettingValue | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => item === b[index]);
  }
  if (typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    const aEntries = Object.entries(a);
    const bMap = new Map(Object.entries(b));
    return aEntries.length === bMap.size && aEntries.every(([key, entry]) => bMap.get(key) === entry);
  }
  return false;
}

export function createSettingsStore(
  catalog: SettingsCatalogMetadata,
  controller: SettingsController,
): SettingsStoreApi {
  const viewModel = buildSettingsViewModel(catalog);
  let base = catalog;

  return createStore<SettingsState & SettingsActions>()((set, get) => {
    function rebase(next: SettingsCatalogMetadata): SettingsViewModel {
      base = next;
      return buildSettingsViewModel(next);
    }

    async function runSave(revision: string): Promise<void> {
      const { drafts, draftErrors, viewModel: vm } = get();
      const ids = Object.keys(drafts);
      if (ids.length === 0) return;
      const errorCount = Object.keys(draftErrors).length;
      if (errorCount > 0) {
        set({
          announcement:
            errorCount === 1
              ? "Not saved. One field needs attention."
              : `Not saved. ${errorCount} fields need attention.`,
        });
        return;
      }
      const changes: SettingsChange[] = Object.entries(drafts).map(([id, draft]) =>
        draft.action === "clear"
          ? { id, scope: draft.scope, action: "clear" }
          : { id, scope: draft.scope, action: "set", ...(draft.value === undefined ? {} : { value: draft.value }) },
      );
      set({ saving: true, announcement: "" });
      const result = await controller.save({ revision, changes });
      if (result.outcome === "applied") {
        const nextModel = rebase(result.catalog);
        const restart = ids.filter((id) => vm.rowsById.get(id)?.restartRequired === true);
        set((state) => ({
          saving: false,
          viewModel: nextModel,
          drafts: {},
          draftErrors: {},
          incoming: null,
          restartIds: [...new Set([...state.restartIds, ...restart])],
          announcement: ids.length === 1 ? "Saved 1 setting." : `Saved ${ids.length} settings.`,
        }));
        return;
      }
      if (result.outcome === "conflict") {
        set({
          saving: false,
          incoming: result.catalog,
          announcement: "Not saved. These settings changed on the host first.",
        });
        return;
      }
      set({ saving: false, announcement: `Not saved. ${result.message}` });
    }

    return {
      viewModel,
      editScope: "global",
      drafts: {},
      draftErrors: {},
      query: "",
      activeSectionId: viewModel.sections[0]?.id ?? "",
      saving: false,
      announcement: "",
      incoming: null,
      restartIds: [],

      setQuery(query) {
        set({ query });
      },
      setActiveSection(sectionId) {
        set({ activeSectionId: sectionId, query: "" });
      },
      setEditScope(scope) {
        set({ editScope: scope });
      },
      stageValue(id, value) {
        const { viewModel: vm, editScope, drafts, draftErrors } = get();
        const row = vm.rowsById.get(id);
        if (row === undefined || row.unavailableReason !== null) return;
        const nextDrafts = { ...drafts };
        const nextErrors = { ...draftErrors };
        const stored = row.layers[editScope]?.value;
        // Typing back the exact stored value un-stages the edit. A row with
        // no value at this layer still stages when the typed value matches
        // the inherited one only if it equals what this layer would resolve
        // to anyway — explicit sets over inherited values are kept.
        if (valueEquals(value, stored)) {
          delete nextDrafts[id];
          delete nextErrors[id];
          set({ drafts: nextDrafts, draftErrors: nextErrors });
          return;
        }
        if (stored === undefined && valueEquals(value, valueAtScope(row, editScope))) {
          delete nextDrafts[id];
          delete nextErrors[id];
          set({ drafts: nextDrafts, draftErrors: nextErrors });
          return;
        }
        nextDrafts[id] = { scope: editScope, action: "set", value };
        const error = validateDraft(row.control, value);
        if (error === null) delete nextErrors[id];
        else nextErrors[id] = error;
        set({ drafts: nextDrafts, draftErrors: nextErrors });
      },
      stageClear(id) {
        const { viewModel: vm, editScope, drafts, draftErrors } = get();
        const row = vm.rowsById.get(id);
        if (row === undefined) return;
        const nextDrafts = { ...drafts };
        const nextErrors = { ...draftErrors };
        delete nextErrors[id];
        if (row.layers[editScope]?.value === undefined) {
          // Nothing set at this layer: dropping any staged edit restores it.
          delete nextDrafts[id];
        } else {
          nextDrafts[id] = { scope: editScope, action: "clear" };
        }
        set({ drafts: nextDrafts, draftErrors: nextErrors });
      },
      discardDraft(id) {
        const { drafts, draftErrors } = get();
        const nextDrafts = { ...drafts };
        const nextErrors = { ...draftErrors };
        delete nextDrafts[id];
        delete nextErrors[id];
        set({ drafts: nextDrafts, draftErrors: nextErrors });
      },
      discardAll() {
        set({ drafts: {}, draftErrors: {}, announcement: "Changes discarded." });
      },
      save() {
        return runSave(base.revision);
      },
      ingestCatalog(catalog) {
        const { drafts } = get();
        if (Object.keys(drafts).length === 0) {
          set({ viewModel: rebase(catalog), announcement: "Settings refreshed from the host." });
          return;
        }
        set({ incoming: catalog });
      },
      loadIncoming() {
        const { incoming } = get();
        if (incoming === null) return;
        set({
          viewModel: rebase(incoming),
          incoming: null,
          announcement: "Loaded the latest settings. Your unsaved edits are still staged.",
        });
      },
      async saveOverIncoming() {
        const { incoming } = get();
        if (incoming === null) return;
        const revision = incoming.revision;
        set({ viewModel: rebase(incoming), incoming: null });
        await runSave(revision);
      },
      dismissRestart() {
        set({ restartIds: [] });
      },
    };
  });
}

export function useSettings<T>(api: SettingsStoreApi, selector: (state: SettingsState & SettingsActions) => T): T {
  return useStore(api, selector);
}
