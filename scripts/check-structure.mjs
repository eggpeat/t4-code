import { promises as fs } from "node:fs";
import path from "node:path";

const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const IGNORED_DIRS = new Set(["reference", "node_modules", "dist", "build", "out", "coverage", "release", ".git"]);
const RELAXED_PARTS = new Set(["test", "tests", "spec", "specs", "fixture", "fixtures", "generated", "schema"]);

export function countPhysicalLines(text) {
  if (text.length === 0) return 0;
  const lines = text.split(/\r\n|\r|\n/);
  return lines.at(-1) === "" ? lines.length - 1 : lines.length;
}

export function isIgnoredPath(relativePath) {
  return relativePath.split(path.sep).some((part) => part.startsWith(".") || IGNORED_DIRS.has(part));
}

export function limitFor(relativePath) {
  const extension = path.extname(relativePath).toLowerCase();
  if (extension === ".css") return 1000;
  if (!CODE_EXTENSIONS.has(extension)) return null;
  const parts = relativePath.split(path.sep).map((part) => part.toLowerCase());
  const basename = parts.at(-1);
  const relaxed = parts.some((part) => RELAXED_PARTS.has(part)) || /^(?:schema|fixtures?|.*[._-](?:generated|test|spec))(?:[._-]|$)/u.test(basename) || parts.includes("packages") && parts.includes("fixture-server");
  return relaxed ? 1000 : 650;
}

export async function collectFiles(root) {
  const files = [];
  async function visit(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute);
      if (entry.isDirectory()) {
        if (!isIgnoredPath(relative)) await visit(absolute);
      } else if (entry.isFile() && !isIgnoredPath(relative) && limitFor(relative) !== null) {
        files.push(relative);
      }
    }
  }
  await visit(root);
  return files.sort((a, b) => a.localeCompare(b));
}

export async function checkStructure(root = process.cwd()) {
  const files = await collectFiles(root);
  const failures = [];
  let checked = 0;
  for (const relative of files) {
    const limit = limitFor(relative);
    const lines = countPhysicalLines(await fs.readFile(path.join(root, relative), "utf8"));
    checked += 1;
    if (lines > limit) failures.push({ path: relative, lines, limit });
  }
  return { checked, failures };
}

export function formatReport(result) {
  const lines = [`Checked ${result.checked} files; ${result.failures.length} failure${result.failures.length === 1 ? "" : "s"}.`];
  for (const failure of result.failures) lines.push(`${failure.path}: ${failure.lines} lines (max ${failure.limit})`);
  return lines.join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await checkStructure(process.cwd());
  console.log(formatReport(result));
  if (result.failures.length) process.exitCode = 1;
}
