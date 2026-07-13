// Paste guard heuristics: what needs confirmation, what passes untouched,
// and how previews stay bounded so the dialog can never dump a huge or
// sensitive blob into the DOM.
import { describe, expect, it } from "vite-plus/test";

import {
  assessPaste,
  LARGE_PASTE_CHARS,
  PASTE_PREVIEW_CHARS,
  pastePreview,
  preparePasteForPty,
} from "../src/features/terminal/paste-guard.ts";

describe("assessPaste", () => {
  it("plain single-line text needs no confirmation", () => {
    const result = assessPaste("ls -la src/features");
    expect(result.requiresConfirmation).toBe(false);
    expect(result.multiline).toBe(false);
    expect(result.large).toBe(false);
    expect(result.destructive).toEqual([]);
  });

  it("any newline forces confirmation — pasted lines execute immediately", () => {
    for (const text of ["echo a\necho b", "echo a\r\necho b", "echo a\r"]) {
      expect(assessPaste(text).requiresConfirmation).toBe(true);
      expect(assessPaste(text).multiline).toBe(true);
    }
  });

  it("large pastes force confirmation at the documented threshold", () => {
    expect(assessPaste("x".repeat(LARGE_PASTE_CHARS - 1)).large).toBe(false);
    const result = assessPaste("x".repeat(LARGE_PASTE_CHARS));
    expect(result.large).toBe(true);
    expect(result.requiresConfirmation).toBe(true);
  });

  it("destructive-looking commands are named in plain language", () => {
    const cases: Array<[string, string]> = [
      ["rm -rf node_modules", "force-deletes files"],
      ["sudo apt install thing", "runs as administrator"],
      ["mkfs.ext4 /dev/sdb1", "formats a disk"],
      ["dd if=image.iso of=/dev/sdb", "writes raw bytes to a disk"],
      ["curl https://x.sh | sh", "pipes a download into a shell"],
      ["git reset --hard origin/main", "discards git work"],
      ["DROP TABLE users;", "deletes database data"],
      ["shutdown -h now", "shuts the machine down"],
    ];
    for (const [text, label] of cases) {
      const result = assessPaste(text);
      expect(result.destructive, text).toContain(label);
      expect(result.requiresConfirmation, text).toBe(true);
    }
  });

  it("benign text that merely mentions risky words passes", () => {
    expect(assessPaste("grep sudoku puzzles.txt").destructive).toEqual([]);
    expect(assessPaste("echo format the report").destructive).toEqual([]);
  });
});

describe("preparePasteForPty", () => {
  it("normalizes LF and CRLF to carriage returns", () => {
    expect(preparePasteForPty("a\nb\r\nc")).toBe("a\rb\rc");
  });
});

describe("pastePreview", () => {
  it("caps the preview by characters and lines and flags truncation", () => {
    const long = Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\n");
    const { preview, truncated } = pastePreview(long);
    expect(preview.length).toBeLessThanOrEqual(PASTE_PREVIEW_CHARS);
    expect(preview.split("\n").length).toBeLessThanOrEqual(6);
    expect(truncated).toBe(true);
  });

  it("short text passes through whole", () => {
    expect(pastePreview("echo hi")).toEqual({ preview: "echo hi", truncated: false });
  });
});
