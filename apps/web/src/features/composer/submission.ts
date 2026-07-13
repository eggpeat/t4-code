// Prompt submission gate: the piece between the composer's Send affordance
// and `SessionRuntime.submitPrompt`. It owns the three safety behaviors the
// UI must never get wrong:
//   - the draft clears only after the runtime reports "accepted";
//   - a rejected or unknown outcome keeps the exact draft, attachments, and
//     caret, and surfaces a retry-safe notice — never an automatic replay;
//   - while one submission is in flight, further submits are no-ops.
// Pure decision logic lives in `settleSubmission`; the gate adds the
// in-flight latch and applies the settlement through a tiny IO seam so the
// component stays declarative and tests can drive the real runtime headless.
import type { PromptOutcome } from "../session-runtime/controller.ts";
import type { SessionIntent } from "../session-runtime/intents.ts";

/** What one submission carried, remembered so settlement can compare. */
export interface SubmittedPrompt {
  /** The draft text exactly as it stood at submit time (untrimmed). */
  readonly text: string;
  /** Attachment ids sent with the prompt; removed only on acceptance. */
  readonly attachmentIds: readonly string[];
}

/** Inline status under the composer; null when the last send settled clean. */
export type SubmissionNotice = {
  readonly kind: "rejected" | "unknown";
  readonly message: string;
} | null;

export interface SubmissionSettlement {
  readonly clearDraft: boolean;
  readonly removeAttachmentIds: readonly string[];
  readonly notice: SubmissionNotice;
}

/**
 * Decide what an outcome does to the composer. On acceptance the draft
 * clears only when it still reads exactly what was submitted — anything the
 * user typed during the round-trip survives. Rejected and unknown outcomes
 * touch nothing: same draft, same attachments, one honest notice.
 */
export function settleSubmission(
  outcome: PromptOutcome,
  submitted: SubmittedPrompt,
  currentDraft: string,
): SubmissionSettlement {
  if (outcome.kind === "accepted") {
    return {
      clearDraft: currentDraft === submitted.text,
      removeAttachmentIds: submitted.attachmentIds,
      notice: null,
    };
  }
  return {
    clearDraft: false,
    removeAttachmentIds: [],
    notice: { kind: outcome.kind, message: outcome.reason },
  };
}

/** How a settlement lands in the composer's stores. */
export interface SubmissionIo {
  readonly getDraft: () => string;
  readonly clearDraft: () => void;
  readonly removeAttachments: (ids: readonly string[]) => void;
  readonly setNotice: (notice: SubmissionNotice) => void;
}

export interface SubmissionGate {
  /** True while a submission is awaiting its outcome. */
  readonly pending: () => boolean;
  /**
   * Submit once. Returns the runtime's outcome, or null when another
   * submission is already in flight (the duplicate is dropped, not queued).
   */
  readonly submit: (
    intent: SessionIntent,
    submitted: SubmittedPrompt,
    io: SubmissionIo,
  ) => Promise<PromptOutcome | null>;
}

export function createSubmissionGate(
  submitPrompt: (intent: SessionIntent) => Promise<PromptOutcome>,
): SubmissionGate {
  let inFlight = false;
  return {
    pending: () => inFlight,
    async submit(intent, submitted, io) {
      if (inFlight) return null;
      inFlight = true;
      io.setNotice(null);
      let outcome: PromptOutcome;
      try {
        outcome = await submitPrompt(intent);
      } catch {
        // The runtime contract resolves with an outcome; a throw is the
        // transport vanishing mid-flight, which is the same truth as
        // "unknown": nothing may be cleared and nothing replays.
        outcome = {
          kind: "unknown",
          reason: "The connection dropped before the host answered. Check the transcript before sending again.",
        };
      } finally {
        inFlight = false;
      }
      const settlement = settleSubmission(outcome, submitted, io.getDraft());
      if (settlement.clearDraft) io.clearDraft();
      if (settlement.removeAttachmentIds.length > 0) {
        io.removeAttachments(settlement.removeAttachmentIds);
      }
      io.setNotice(settlement.notice);
      return outcome;
    },
  };
}
