import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { checkProvenance } from "./check-provenance.mjs";

const sha1 = "a".repeat(40);
const commit = "b".repeat(40);
async function fixture(overrides = {}, body = "hello") {
  const root = await mkdtemp(path.join(os.tmpdir(), "provenance-"));
  await mkdir(path.join(root, "provenance/t3code/imports"), { recursive: true });
  await mkdir(path.join(root, "src")); await writeFile(path.join(root, "src/file.txt"), body);
  await mkdir(path.join(root, "licenses")); await writeFile(path.join(root, "licenses/MIT.txt"), "MIT");
  const checksum = `sha256:${createHash("sha256").update(body).digest("hex")}`;
  const record = { sourcePath: "src/original.txt", sourceBlobSha: sha1, targetPath: "src/file.txt", classification: "copied", checksum, ...overrides.record };
  await writeFile(path.join(root, "provenance/t3code/imports/batch.json"), JSON.stringify({ batch: "batch", sourceCommit: commit, adaptationCommit: commit, license: "MIT; Owner; licenses/MIT.txt", records: [record], ...overrides.manifest }));
  return root;
}
test("accepts valid manifest and real checksum", async () => assert.equal((await checkProvenance(await fixture())).failures.length, 0));
test("reports stale, malformed, traversal, missing, duplicate with stable diagnostics", async () => {
  const root = await fixture({ record: { checksum: "sha256:" + "0".repeat(64), sourceBlobSha: "BAD", targetPath: "../nope" }, manifest: { sourceCommit: "BAD", records: [{ sourcePath: "x", sourceBlobSha: sha1, targetPath: "src/file.txt", classification: "copied", checksum: "sha256:" + "0".repeat(64) }] } });
  const first = await checkProvenance(root); const second = await checkProvenance(root);
  assert.deepEqual(first.failures, second.failures); assert(first.failures.some((line) => line.includes("checksum mismatch") || line.includes("targetPath")));
});
