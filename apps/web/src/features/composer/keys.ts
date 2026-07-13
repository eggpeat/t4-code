// Pure keyboard decisions for the composer and its panels. Kept free of DOM
// so the IME contract is unit-testable: a composition session (isComposing,
// or the legacy keyCode 229 some IMEs report on commit) never submits.

export interface ComposerKeyInput {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly isComposing: boolean;
  /** Legacy IME signal: some engines report keyCode 229 while composing. */
  readonly keyCode?: number;
}

export type ComposerKeyAction = "submit" | "newline" | "none";

/**
 * Enter submits; Shift+Enter (and Alt/Ctrl/Meta+Enter) inserts a newline;
 * anything typed during IME composition is left to the editor.
 */
export function resolveComposerKey(input: ComposerKeyInput): ComposerKeyAction {
  if (input.key !== "Enter") return "none";
  if (input.isComposing || input.keyCode === 229) return "none";
  if (input.shiftKey || input.altKey || input.ctrlKey || input.metaKey) return "newline";
  return "submit";
}

export type MenuKeyAction = "next" | "previous" | "accept" | "dismiss" | "none";

/** Keyboard contract for the slash-command menu attached to the textarea. */
export function resolveMenuKey(input: ComposerKeyInput): MenuKeyAction {
  if (input.isComposing || input.keyCode === 229) return "none";
  switch (input.key) {
    case "ArrowDown":
      return "next";
    case "ArrowUp":
      return "previous";
    case "Enter":
    case "Tab":
      return "accept";
    case "Escape":
      return "dismiss";
    default:
      return "none";
  }
}

/**
 * Numeric shortcut for ask options: keys 1–9 select the matching option when
 * the panel has focus and the user is not composing text.
 */
export function resolveAskDigit(input: ComposerKeyInput, optionCount: number): number | null {
  if (input.isComposing || input.keyCode === 229) return null;
  if (input.ctrlKey || input.metaKey || input.altKey) return null;
  if (input.key.length !== 1 || input.key < "1" || input.key > "9") return null;
  const index = input.key.charCodeAt(0) - "1".charCodeAt(0);
  return index < optionCount ? index : null;
}
