// Keyboard behavior for the section rail: a single-tab-stop listbox with
// roving focus. Pure so the arrow/Home/End contract is testable without a
// DOM; the component maps the returned id to a real element and focuses it.

export type RailKey = "ArrowDown" | "ArrowUp" | "Home" | "End";

/**
 * The section id that should receive focus after a key press, or null when
 * the key doesn't move focus (edges don't wrap — a rail is a list, not a
 * carousel).
 */
export function railFocusTarget(
  sectionIds: readonly string[],
  currentId: string,
  key: RailKey,
): string | null {
  if (sectionIds.length === 0) return null;
  const index = sectionIds.indexOf(currentId);
  switch (key) {
    case "Home":
      return sectionIds[0] === currentId ? null : (sectionIds[0] ?? null);
    case "End": {
      const last = sectionIds[sectionIds.length - 1] ?? null;
      return last === currentId ? null : last;
    }
    case "ArrowDown": {
      if (index === -1) return sectionIds[0] ?? null;
      return sectionIds[index + 1] ?? null;
    }
    case "ArrowUp": {
      if (index === -1) return sectionIds[0] ?? null;
      return index === 0 ? null : (sectionIds[index - 1] ?? null);
    }
  }
}
