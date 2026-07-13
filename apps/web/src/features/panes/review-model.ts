// Review diff rendering logic: parse unified-diff hunks into rows, pair rows
// for the split view, and keep line-anchored comments attached to real
// lines. Pure functions over `ReviewFile.patch` strings.

export interface DiffRow {
  readonly kind: "hunk" | "context" | "add" | "del";
  /** 1-based line number in the old file; null for adds and hunk headers. */
  readonly oldLine: number | null;
  /** 1-based line number in the new file; null for dels and hunk headers. */
  readonly newLine: number | null;
  readonly text: string;
}

/**
 * Parse a unified diff body (`@@ -a,b +c,d @@` hunks). Tolerant by design:
 * malformed lines render as context rather than throwing away the file.
 */
export function parseUnifiedPatch(patch: string): DiffRow[] {
  const rows: DiffRow[] = [];
  let oldLine = 0;
  let newLine = 0;
  for (const line of patch.split("\n")) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(line);
    if (hunk !== null) {
      oldLine = Number.parseInt(hunk[1] ?? "1", 10);
      newLine = Number.parseInt(hunk[2] ?? "1", 10);
      rows.push({ kind: "hunk", oldLine: null, newLine: null, text: line });
      continue;
    }
    if (line.startsWith("+")) {
      rows.push({ kind: "add", oldLine: null, newLine, text: line.slice(1) });
      newLine += 1;
    } else if (line.startsWith("-")) {
      rows.push({ kind: "del", oldLine, newLine: null, text: line.slice(1) });
      oldLine += 1;
    } else if (line === "\\ No newline at end of file") {
      // Metadata line; not content.
    } else if (line.length > 0 || rows.length > 0) {
      rows.push({ kind: "context", oldLine, newLine, text: line.startsWith(" ") ? line.slice(1) : line });
      oldLine += 1;
      newLine += 1;
    }
  }
  // A trailing empty context row from the final newline carries no content.
  const last = rows[rows.length - 1];
  if (last !== undefined && last.kind === "context" && last.text === "") rows.pop();
  return rows;
}

export interface SplitRow {
  readonly left: DiffRow | null;
  readonly right: DiffRow | null;
}

/**
 * Pair unified rows for the split view: deletions align with the additions
 * that replaced them; unpaired rows leave the other side blank.
 */
export function buildSplitRows(rows: readonly DiffRow[]): SplitRow[] {
  const result: SplitRow[] = [];
  let index = 0;
  while (index < rows.length) {
    const row = rows[index] as DiffRow;
    if (row.kind === "hunk" || row.kind === "context") {
      result.push({ left: row, right: row });
      index += 1;
      continue;
    }
    // Collect the run of deletions, then the run of additions that follows.
    const dels: DiffRow[] = [];
    const adds: DiffRow[] = [];
    while (index < rows.length && rows[index]?.kind === "del") {
      dels.push(rows[index] as DiffRow);
      index += 1;
    }
    while (index < rows.length && rows[index]?.kind === "add") {
      adds.push(rows[index] as DiffRow);
      index += 1;
    }
    const pairCount = Math.max(dels.length, adds.length);
    for (let i = 0; i < pairCount; i++) {
      result.push({ left: dels[i] ?? null, right: adds[i] ?? null });
    }
  }
  return result;
}

/** Count additions/deletions straight from the patch, not from metadata. */
export function countPatchChanges(patch: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const row of parseUnifiedPatch(patch)) {
    if (row.kind === "add") additions += 1;
    else if (row.kind === "del") deletions += 1;
  }
  return { additions, deletions };
}

/** A comment anchors to one side's line; resolve which row it sits under. */
export function rowMatchesComment(
  row: DiffRow,
  side: "old" | "new",
  line: number,
): boolean {
  return side === "new" ? row.newLine === line : row.oldLine === line && row.kind !== "context";
}
