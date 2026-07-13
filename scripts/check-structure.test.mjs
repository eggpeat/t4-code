import assert from "node:assert/strict";
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { checkStructure, countPhysicalLines, formatReport, limitFor } from "./check-structure.mjs";

const lines = (count, ending = "\n") => Array.from({ length: count }, (_, index) => `line ${index + 1}`).join("\n") + ending;

test("counts boundaries, CRLF, and trailing newline without phantom line", () => {
  assert.equal(countPhysicalLines(""), 0);
  assert.equal(countPhysicalLines("a\nb"), 2);
  assert.equal(countPhysicalLines("a\n"), 1);
  assert.equal(countPhysicalLines("a\r\nb\r\n"), 2);
  assert.equal(countPhysicalLines("a\rb"), 2);
});

test("classifies production, relaxed, fixture-server, and css limits", () => {
  assert.equal(limitFor("src/app.ts"), 650);
  assert.equal(limitFor("src/app.test.ts"), 1000);
  assert.equal(limitFor("tests/data.ts"), 1000);
  assert.equal(limitFor("packages/foo/schema.ts"), 1000);
  assert.equal(limitFor("src/model.generated.ts"), 1000);
  assert.equal(limitFor("packages/fixture-server/src/index.ts"), 1000);
  assert.equal(limitFor("src/styles.css"), 1000);
  assert.equal(limitFor("README.md"), null);
});

test("reports exact boundaries and stable sorted failures while ignoring dirs and symlink dirs", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "structure-"));
  await mkdir(path.join(root, "src"), { recursive: true });
  await mkdir(path.join(root, "tests"), { recursive: true });
  await mkdir(path.join(root, "dist"), { recursive: true });
  await mkdir(path.join(root, ".cache"), { recursive: true });
  await writeFile(path.join(root, "src", "ok.ts"), lines(650));
  await writeFile(path.join(root, "src", "too.ts"), lines(651));
  await writeFile(path.join(root, "tests", "ok.ts"), lines(1000, "\r\n"));
  await writeFile(path.join(root, "dist", "ignored.ts"), lines(2000));
  await writeFile(path.join(root, ".cache", "ignored.ts"), lines(2000));
  await symlink(path.join(root, "src"), path.join(root, "linked"));
  const result = await checkStructure(root);
  assert.deepEqual(result.failures, [{ path: "src/too.ts", lines: 651, limit: 650 }]);
  assert.match(formatReport(result), /src\/too\.ts: 651 lines \(max 650\)/);
});
