// Paste guard for user terminals: multiline, oversized, or
// destructive-looking clipboard text needs an explicit confirmation that
// names the target shell before any byte reaches the PTY. The pasted text
// itself is never logged, persisted, or echoed anywhere except the terminal
// the user confirmed.

/** Pastes at or above this size always ask first. */
export const LARGE_PASTE_CHARS = 1_000;

/** Longest preview the confirmation dialog may show. */
export const PASTE_PREVIEW_CHARS = 280;

interface DestructivePattern {
  /** Short plain-language description shown in the confirmation dialog. */
  readonly label: string;
  readonly pattern: RegExp;
}

// Heuristics, not a sandbox: they catch the common "pasted the wrong thing
// into the wrong shell" disasters, they do not certify safety.
const DESTRUCTIVE_PATTERNS: readonly DestructivePattern[] = [
  { label: "force-deletes files", pattern: /\brm\s+(?:-[a-z-]*\s+)*-[a-z]*[rf]/i },
  { label: "runs as administrator", pattern: /\bsudo\b|\bdoas\b/ },
  { label: "formats a disk", pattern: /\bmkfs\b/ },
  { label: "writes raw bytes to a disk", pattern: /\bdd\b[^\n|;]*\bof=\/dev\// },
  { label: "writes to a raw device", pattern: />\s*\/dev\/(?:sd|nvme|vd|hd|mmcblk)/ },
  { label: "is a fork bomb", pattern: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;?\s*:/ },
  { label: "sweeps file permissions", pattern: /\bch(?:mod|own)\b[^\n|;]*\s-[a-z]*R/ },
  { label: "pipes a download into a shell", pattern: /\b(?:curl|wget)\b[^\n|;]*\|\s*(?:sudo\s+)?(?:ba|z|da|fi)?sh\b/ },
  { label: "discards git work", pattern: /\bgit\s+(?:reset\s+--hard|clean\s+-[a-z]*[fd])/ },
  { label: "deletes database data", pattern: /\b(?:drop\s+(?:table|database|schema)|truncate\s+table)\b/i },
  { label: "shuts the machine down", pattern: /\b(?:shutdown|reboot|poweroff|halt)\b/ },
];

export interface PasteAssessment {
  readonly chars: number;
  readonly lines: number;
  readonly multiline: boolean;
  readonly large: boolean;
  /** Plain-language descriptions of every destructive match, deduplicated. */
  readonly destructive: readonly string[];
  readonly requiresConfirmation: boolean;
}

export function assessPaste(text: string): PasteAssessment {
  const chars = text.length;
  // A single trailing newline still executes on paste — count it as a line.
  const lines = text.length === 0 ? 0 : text.split(/\r\n|\r|\n/).length;
  const multiline = /[\r\n]/.test(text);
  const large = chars >= LARGE_PASTE_CHARS;
  const destructive: string[] = [];
  for (const entry of DESTRUCTIVE_PATTERNS) {
    if (entry.pattern.test(text)) destructive.push(entry.label);
  }
  return {
    chars,
    lines,
    multiline,
    large,
    destructive,
    requiresConfirmation: multiline || large || destructive.length > 0,
  };
}

/** Normalize clipboard newlines to carriage returns, the way a TTY expects. */
export function preparePasteForPty(text: string): string {
  return text.replace(/\r?\n/g, "\r");
}

/** Bounded dialog preview: first lines only, hard character cap. */
export function pastePreview(text: string): { readonly preview: string; readonly truncated: boolean } {
  const capped = text.slice(0, PASTE_PREVIEW_CHARS);
  const lines = capped.split(/\r\n|\r|\n/);
  const preview = lines.slice(0, 6).join("\n");
  return { preview, truncated: preview.length < text.length };
}
