// Remote-protocol invariant for fixtures and display payloads: a command's
// working directory is server-side and project-relative (app-wire 0.4
// term.open / session.create). No fixture, approval payload, or terminal
// request may carry a home-anchored ("~/...") or absolute ("/...") cwd —
// user-visible surfaces say "Project root" or a relative path instead.
// Host-authored settings sourcePaths (e.g. `~/.omp/config.yml`) are
// provenance metadata, not command cwds, and stay untouched.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";

const SRC_ROOT = join(import.meta.dirname, "../src");

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      files.push(...listSourceFiles(path));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(path);
    }
  }
  return files;
}

describe("fixture cwd invariant", () => {
  // Matches `cwd: "~/..."`, `cwd: "/..."`, `"cwd": "~/..."`, `'cwd': '/...'`.
  const LOCAL_CWD = /["']?cwd["']?\s*:\s*["'](?:~|\/)/;

  it("no cwd in web source is home-anchored or absolute", () => {
    for (const file of listSourceFiles(SRC_ROOT)) {
      const content = readFileSync(file, "utf8");
      const match = content.match(LOCAL_CWD);
      expect(match, `${file}: ${match?.[0] ?? ""}`).toBeNull();
    }
  });
});
