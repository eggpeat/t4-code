// Review contract: unified diff parsing, split pairing, line-anchored
// comments, and the apply/discard + edge-state flow through the store.
import { describe, expect, it } from "vite-plus/test";

import {
  createInspectorStore,
  resolveReviewOutcome,
  type InspectorStoreApi,
} from "../src/features/panes/inspector-store.ts";
import type { ReviewFile } from "../src/features/panes/model.ts";
import {
  buildSplitRows,
  countPatchChanges,
  parseUnifiedPatch,
  rowMatchesComment,
} from "../src/features/panes/review-model.ts";

const PATCH = `@@ -10,4 +10,5 @@ header
 context one
-removed line
+added line
+second added
 context two
`;

describe("unified patch parsing", () => {
  it("tracks old/new line numbers through hunks", () => {
    const rows = parseUnifiedPatch(PATCH);
    expect(rows[0]).toEqual({ kind: "hunk", oldLine: null, newLine: null, text: "@@ -10,4 +10,5 @@ header" });
    expect(rows[1]).toEqual({ kind: "context", oldLine: 10, newLine: 10, text: "context one" });
    expect(rows[2]).toEqual({ kind: "del", oldLine: 11, newLine: null, text: "removed line" });
    expect(rows[3]).toEqual({ kind: "add", oldLine: null, newLine: 11, text: "added line" });
    expect(rows[4]).toEqual({ kind: "add", oldLine: null, newLine: 12, text: "second added" });
    expect(rows[5]).toEqual({ kind: "context", oldLine: 12, newLine: 13, text: "context two" });
  });

  it("counts changes from the patch itself", () => {
    expect(countPatchChanges(PATCH)).toEqual({ additions: 2, deletions: 1 });
  });

  it("pairs deletions with their replacing additions in split view", () => {
    const split = buildSplitRows(parseUnifiedPatch(PATCH));
    // context rows mirror on both sides
    expect(split[1]?.left).toBe(split[1]?.right);
    // del pairs with first add; second add sits alone on the right
    expect(split[2]?.left?.kind).toBe("del");
    expect(split[2]?.right?.kind).toBe("add");
    expect(split[3]?.left).toBeNull();
    expect(split[3]?.right?.kind).toBe("add");
  });

  it("anchors comments to the correct side's line", () => {
    const rows = parseUnifiedPatch(PATCH);
    const addRow = rows[3];
    const delRow = rows[2];
    if (addRow === undefined || delRow === undefined) throw new Error("fixture rows missing");
    expect(rowMatchesComment(addRow, "new", 11)).toBe(true);
    expect(rowMatchesComment(delRow, "new", 11)).toBe(false);
    expect(rowMatchesComment(delRow, "old", 11)).toBe(true);
  });
});

function reviewFile(partial: Partial<ReviewFile> & Pick<ReviewFile, "path">): ReviewFile {
  return {
    oldPath: null,
    status: "modified",
    kind: "text",
    additions: 1,
    deletions: 0,
    patch: PATCH,
    sizeBytes: null,
    applyState: "pending",
    ...partial,
  };
}

function storeWithFiles(files: ReviewFile[]): {
  api: InspectorStoreApi;
  reviewCalls: string[];
} {
  const reviewCalls: string[] = [];
  let apiRef: InspectorStoreApi | null = null;
  const api = createInspectorStore({
    sampleMode: true,
    controller: (storeApi) => {
      apiRef = storeApi;
      return {
        kind: "fixture",
        performControl: () => {},
        performReview: (action, path) => {
          reviewCalls.push(`${action}:${path}`);
          if (apiRef !== null) {
            resolveReviewOutcome(apiRef, path, action === "apply" ? "applied" : "discarded");
          }
        },
        loadDir: () => {},
        loadPreview: () => {},
      };
    },
    seed: {
      review: {
        files,
        comments: [],
        selectedPath: null,
        view: "unified",
        wrap: false,
        viewedByPath: {},
        draftAnchor: null,
      },
    },
  });
  return { api, reviewCalls };
}

describe("review store flow", () => {
  it("apply/discard route through the controller and settle the file state", () => {
    const { api, reviewCalls } = storeWithFiles([
      reviewFile({ path: "a.ts" }),
      reviewFile({ path: "b.ts" }),
    ]);
    api.getState().applyReviewFile("a.ts");
    api.getState().discardReviewFile("b.ts");
    expect(reviewCalls).toEqual(["apply:a.ts", "discard:b.ts"]);
    const files = api.getState().review.files;
    expect(files.find((f) => f.path === "a.ts")?.applyState).toBe("applied");
    expect(files.find((f) => f.path === "b.ts")?.applyState).toBe("discarded");
  });

  it("comments anchor to a file line and survive view toggles", () => {
    const { api } = storeWithFiles([reviewFile({ path: "a.ts" })]);
    const state = api.getState();
    state.selectReviewFile("a.ts");
    state.openCommentDraft(11, "new");
    expect(api.getState().review.draftAnchor).toEqual({ line: 11, side: "new" });
    state.addComment("a.ts", 11, "new", "  fence looks right  ");
    const comments = api.getState().review.comments;
    expect(comments).toHaveLength(1);
    expect(comments[0]?.text).toBe("fence looks right");
    expect(api.getState().review.draftAnchor).toBeNull();
    state.setReviewView("split");
    state.setReviewWrap(true);
    expect(api.getState().review.comments).toHaveLength(1);
    // Empty comments are refused.
    state.addComment("a.ts", 12, "new", "   ");
    expect(api.getState().review.comments).toHaveLength(1);
  });

  it("viewed state is per path and reversible", () => {
    const { api } = storeWithFiles([reviewFile({ path: "a.ts" })]);
    api.getState().setReviewViewed("a.ts", true);
    expect(api.getState().review.viewedByPath["a.ts"]).toBe(true);
    api.getState().setReviewViewed("a.ts", false);
    expect(api.getState().review.viewedByPath["a.ts"]).toBe(false);
  });

  it("binary, huge, and missing files carry no patch to render", () => {
    const binary = reviewFile({ path: "img.png", kind: "binary", patch: null, sizeBytes: 42 });
    const huge = reviewFile({ path: "gen.ts", kind: "huge", patch: null, sizeBytes: 2_000_000 });
    const missing = reviewFile({ path: "gone.ts", kind: "missing", patch: null, status: "deleted" });
    const { api } = storeWithFiles([binary, huge, missing]);
    for (const file of api.getState().review.files) {
      expect(file.patch).toBeNull();
    }
  });
});
