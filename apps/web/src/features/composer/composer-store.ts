// Composer-local attachment staging, keyed by session. Draft *text*
// continuity lives in the shared workspace store (setSessionDraft); model /
// thinking / fast / mode selections are SESSION state owned by the runtime
// (live host or fixture) and are never persisted renderer-side. This store
// keeps only in-memory attachments awaiting the next prompt.
import { createStore, type StoreApi, useStore } from "zustand";

import type { PromptAttachment } from "../session-runtime/intents.ts";

/**
 * The retired v1 options-persistence key. Model/thinking/fast/mode moved to
 * session-state authority; any surviving blob is stale renderer truth and
 * gets removed on boot so it can never leak back into a control.
 */
export const LEGACY_COMPOSER_STORAGE_KEY = "omp:composer:v1";

export function purgeLegacyComposerPersistence(storage: Pick<Storage, "removeItem">): void {
  try {
    storage.removeItem(LEGACY_COMPOSER_STORAGE_KEY);
  } catch {
    // Storage unavailable: nothing to purge.
  }
}

export interface ComposerStoreState {
  readonly attachmentsBySessionId: Record<string, readonly PromptAttachment[]>;
  addAttachments(sessionId: string, attachments: readonly PromptAttachment[]): void;
  removeAttachment(sessionId: string, attachmentId: string): void;
  clearAttachments(sessionId: string): void;
}

export type ComposerStoreApi = StoreApi<ComposerStoreState>;

export function createComposerStore(): ComposerStoreApi {
  return createStore<ComposerStoreState>((set) => ({
    attachmentsBySessionId: {},
    addAttachments: (sessionId, attachments) =>
      set((state) => ({
        attachmentsBySessionId: {
          ...state.attachmentsBySessionId,
          [sessionId]: [...(state.attachmentsBySessionId[sessionId] ?? []), ...attachments],
        },
      })),
    removeAttachment: (sessionId, attachmentId) =>
      set((state) => ({
        attachmentsBySessionId: {
          ...state.attachmentsBySessionId,
          [sessionId]: (state.attachmentsBySessionId[sessionId] ?? []).filter(
            (attachment) => attachment.id !== attachmentId,
          ),
        },
      })),
    clearAttachments: (sessionId) =>
      set((state) => ({
        attachmentsBySessionId: { ...state.attachmentsBySessionId, [sessionId]: [] },
      })),
  }));
}

// Module singleton mirrors the workspace-store wiring style.
export const composerStore = createComposerStore();
if (typeof localStorage !== "undefined") purgeLegacyComposerPersistence(localStorage);

export function useComposer<T>(selector: (state: ComposerStoreState) => T): T {
  return useStore(composerStore, selector);
}
