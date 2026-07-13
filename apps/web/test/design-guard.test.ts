// Design-system guard: app code consumes tokens only. Raw color literals,
// Tailwind's stock palette, and grain/turbulence effects are defects outside
// packages/ui/src/tokens.css.
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
    } else if (/\.(ts|tsx|css)$/.test(entry)) {
      files.push(path);
    }
  }
  return files;
}

const BANNED = [
  { name: "hex color literal", pattern: /#[0-9a-fA-F]{3,8}\b(?![\w-])/ },
  { name: "css color function", pattern: /\b(?:rgb|rgba|hsl|hsla|oklch|oklab|hwb)\(/ },
  {
    name: "tailwind stock palette class",
    pattern:
      /\b(?:bg|text|border|fill|stroke|ring|shadow|from|via|to)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone|black|white)(?:-\d{2,3})?\b/,
  },
  { name: "grain/turbulence effect", pattern: /feTurbulence|fractalNoise|grain/i },
  { name: "gradient text", pattern: /background-clip:\s*text|bg-clip-text/ },
  { name: "blanket transition", pattern: /\btransition-all\b|transition:\s*all\b/ },
  {
    // Raw Tailwind durations/delays bypass the motion tokens (and reduced
    // motion). `duration-0` stays legal for intentionally-instant states.
    name: "raw duration/delay utility",
    pattern: /\b(?:duration|delay)-\d{2,}\b/,
  },
  { name: "retired legacy accent value", pattern: /f97316/i },
];

describe("owned UI code stays token-native", () => {
  const files = listSourceFiles(SRC_ROOT);

  it("scans a real tree", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  for (const { name, pattern } of BANNED) {
    it(`contains no ${name}`, () => {
      for (const file of files) {
        const content = readFileSync(file, "utf8");
        const match = content.match(pattern);
        expect(match, `${file}: ${match?.[0] ?? ""}`).toBeNull();
      }
    });
  }
});
