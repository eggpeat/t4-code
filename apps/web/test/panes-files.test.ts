// Files pane contract: lazy directory loading through the controller seam,
// preview resolution races, and offline degradation.
import { describe, expect, it } from "vite-plus/test";

import {
  createInspectorStore,
  resolveDir,
  resolvePreview,
  type InspectorStoreApi,
} from "../src/features/panes/inspector-store.ts";
import type { FileTreeNode } from "../src/features/panes/model.ts";

const ROOT: FileTreeNode[] = [
  { path: "src", name: "src", kind: "dir" },
  { path: "README.md", name: "README.md", kind: "file" },
];

function storeWithDirs(): { api: InspectorStoreApi; dirCalls: string[]; previewCalls: string[] } {
  const dirCalls: string[] = [];
  const previewCalls: string[] = [];
  const api = createInspectorStore({
    sampleMode: true,
    controller: () => ({
      kind: "fixture",
      performControl: () => {},
      performReview: () => {},
      loadDir: (path) => dirCalls.push(path),
      loadPreview: (path) => previewCalls.push(path),
    }),
  });
  return { api, dirCalls, previewCalls };
}

describe("lazy file tree", () => {
  it("expanding an unknown directory marks it loading and asks the controller once", () => {
    const { api, dirCalls } = storeWithDirs();
    api.getState().setFileExpanded("src", true);
    expect(api.getState().files.childrenByPath.src).toBe("loading");
    expect(dirCalls).toEqual(["src"]);
    // Collapse and re-expand: already known (loading), no duplicate fetch.
    api.getState().setFileExpanded("src", false);
    api.getState().setFileExpanded("src", true);
    expect(dirCalls).toEqual(["src"]);
    resolveDir(api, "src", ROOT);
    expect(api.getState().files.childrenByPath.src).toEqual(ROOT);
  });

  it("a failed listing degrades to an error marker, not a crash", () => {
    const { api } = storeWithDirs();
    api.getState().setFileExpanded("src", true);
    resolveDir(api, "src", "error");
    expect(api.getState().files.childrenByPath.src).toBe("error");
  });

  it("preview resolution is ignored once selection moved on", () => {
    const { api, previewCalls } = storeWithDirs();
    api.getState().selectFile("a.ts");
    api.getState().selectFile("b.ts");
    expect(previewCalls).toEqual(["a.ts", "b.ts"]);
    // The stale a.ts answer lands after selection changed: dropped.
    resolvePreview(api, { kind: "code", path: "a.ts", text: "old", truncated: false });
    expect(api.getState().files.preview).toBe("loading");
    resolvePreview(api, { kind: "code", path: "b.ts", text: "new", truncated: false });
    expect(api.getState().files.preview).toEqual({
      kind: "code",
      path: "b.ts",
      text: "new",
      truncated: false,
    });
  });

  it("clearing selection clears the preview", () => {
    const { api } = storeWithDirs();
    api.getState().selectFile("a.ts");
    api.getState().selectFile(null);
    expect(api.getState().files.preview).toBeNull();
  });
});
