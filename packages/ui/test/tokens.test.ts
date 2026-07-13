// Token ownership and theme-parity contract for tokens.css — the only file
// allowed to hold raw color values.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";

const SRC_DIR = fileURLToPath(new URL("../src", import.meta.url));
const TOKENS_PATH = join(SRC_DIR, "tokens.css");
const tokensCss = readFileSync(TOKENS_PATH, "utf8");

/** Extract the body of the first `selector {` block via brace matching. */
function extractBlock(css: string, selector: string): string {
	const start = css.indexOf(`${selector} {`);
	expect(start, `block "${selector}" exists`).toBeGreaterThanOrEqual(0);
	let depth = 0;
	for (let index = css.indexOf("{", start); index < css.length; index += 1) {
		if (css[index] === "{") depth += 1;
		if (css[index] === "}") {
			depth -= 1;
			if (depth === 0) return css.slice(start, index + 1);
		}
	}
	throw new Error(`unterminated block for ${selector}`);
}

function declaredTokens(block: string): Set<string> {
	return new Set([...block.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1] as string));
}

function tokenValue(block: string, name: string): string {
	const match = block.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
	expect(match, `${name} declared`).not.toBeNull();
	return (match as RegExpMatchArray)[1]!.trim();
}

// The color-bearing :root block is the one declaring --background.
const rootBlocks = [...tokensCss.matchAll(/(?<![-\w.]):root \{/g)].map((match) =>
	extractBlock(tokensCss.slice(match.index), ":root"),
);
const lightBlock = rootBlocks.find((block) => block.includes("--background:")) ?? "";
const darkBlock = extractBlock(tokensCss, ".dark");

const REQUIRED_THEMED_TOKENS = [
	"--background",
	"--foreground",
	"--card",
	"--popover",
	"--secondary",
	"--muted",
	"--muted-foreground",
	"--accent",
	"--border",
	"--input",
	"--brand",
	"--primary",
	"--primary-foreground",
	"--accent-text",
	"--ring",
	"--destructive",
	"--destructive-foreground",
	"--info",
	"--info-foreground",
	"--success",
	"--success-foreground",
	"--warning",
	"--warning-foreground",
	"--status-working",
	"--status-working-dot",
	"--status-approval",
	"--status-approval-dot",
	"--status-input",
	"--status-input-dot",
	"--status-plan",
	"--status-plan-dot",
	"--status-done",
	"--status-done-dot",
	"--status-error",
	"--status-error-dot",
	"--surface-edge-shadow",
	"--skeleton-highlight",
	"--panel-background",
	"--panel-border",
	"--transcript-background",
	"--composer-background",
	"--composer-shadow",
	"--overlay-backdrop",
	"--overlay-shadow",
	"--diff-added-background",
	"--diff-removed-background",
	"--diff-panel-background",
	"--diff-card-background",
	"--markdown-code-background",
	"--markdown-codeblock-background",
	"--scrollbar-thumb",
	"--scrollbar-thumb-hover",
	"--terminal-background",
	"--terminal-foreground",
	"--terminal-cursor",
	"--terminal-selection",
	"--terminal-ansi-black",
	"--terminal-ansi-red",
	"--terminal-ansi-green",
	"--terminal-ansi-yellow",
	"--terminal-ansi-blue",
	"--terminal-ansi-magenta",
	"--terminal-ansi-cyan",
	"--terminal-ansi-white",
	"--terminal-ansi-bright-black",
	"--terminal-ansi-bright-white",
] as const;

describe("tokens.css themes", () => {
	const lightTokens = declaredTokens(lightBlock);
	const darkTokens = declaredTokens(darkBlock);

	it("declares every required token in the light theme", () => {
		const missing = REQUIRED_THEMED_TOKENS.filter((token) => !lightTokens.has(token));
		expect(missing).toEqual([]);
	});

	it("dark theme only overrides tokens the light theme declares", () => {
		const orphans = [...darkTokens].filter((token) => !lightTokens.has(token));
		expect(orphans).toEqual([]);
	});

	it("dark theme overrides every color-bearing required token", () => {
		// Derived tokens (var()-chained) inherit correctly; raw-value tokens must
		// be re-declared per theme. Spot-check the load-bearing set.
		for (const token of [
			"--background",
			"--foreground",
			"--primary",
			"--primary-foreground",
			"--accent-text",
			"--border",
			"--warning-foreground",
			"--status-working",
			"--status-error",
			"--surface-edge-shadow",
			"--scrollbar-thumb",
			"--terminal-cursor",
			"--terminal-ansi-red",
		]) {
			expect(darkTokens.has(token), `${token} overridden in .dark`).toBe(true);
		}
	});

	it("keeps brand pink out of warning and every status token", () => {
		for (const block of [lightBlock, darkBlock]) {
			const brand = tokenValue(block, "--brand");
			for (const name of [
				"--warning",
				"--warning-foreground",
				"--status-working",
				"--status-approval",
				"--status-input",
				"--status-plan",
				"--status-done",
				"--status-error",
			]) {
				const value = tokenValue(block, name);
				expect(value, `${name} must not be brand pink`).not.toBe(brand);
				expect(value).not.toMatch(/e83174/i);
				expect(value).not.toMatch(/var\(--brand\)|var\(--primary\)/);
			}
		}
	});

	it("uses Pi Pink for brand identity in both themes, never the retired accent", () => {
		expect(tokenValue(lightBlock, "--brand")).toBe("#e83174");
		expect(tokenValue(darkBlock, "--brand")).toBe("#e83174");
		// Primary is the AA action tier, never the raw identity value.
		expect(tokenValue(lightBlock, "--primary")).not.toMatch(/e83174/i);
		// The retired legacy accent value is gone from the token file entirely.
		expect(tokensCss).not.toMatch(/f97316/i);
	});
});

describe("clean-surface bans", () => {
	it("contains no turbulence, noise, or grain mechanisms", () => {
		// Ban the actual mechanisms (SVG filters, inline SVG backgrounds), not
		// prose in comments.
		expect(tokensCss).not.toMatch(/feTurbulence|fractalNoise|url\(#|data:image\/svg/i);
	});

	it("contains no gradient-text plumbing", () => {
		expect(tokensCss).not.toMatch(/background-clip:\s*text|-webkit-background-clip/);
	});
});

function walkSourceFiles(dir: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) {
			files.push(...walkSourceFiles(path));
		} else {
			files.push(path);
		}
	}
	return files;
}

describe("raw-color ownership", () => {
	// tokens.css owns raw colors; the copied brand asset is exempt (verbatim
	// upstream bytes). Everything else must reference tokens.
	const exempt = [TOKENS_PATH, join(SRC_DIR, "assets", "omp-mark.svg")];
	const sources = walkSourceFiles(SRC_DIR).filter((path) => !exempt.includes(path));

	it("finds no raw color literals outside tokens.css", () => {
		const offenders: string[] = [];
		for (const path of sources) {
			const content = readFileSync(path, "utf8");
			if (
				/#[0-9a-fA-F]{3,8}\b/.test(content) ||
				/\b(?:rgba?|oklch|hsla?|color-mix)\(/.test(content) ||
				/\b(?:text|bg|border|fill)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d/.test(
					content,
				)
			) {
				offenders.push(path);
			}
		}
		expect(offenders).toEqual([]);
	});

	it("finds no gradient text or noise overlays in components", () => {
		const offenders: string[] = [];
		for (const path of sources) {
			const content = readFileSync(path, "utf8");
			if (/bg-clip-text|feTurbulence|fractalNoise/.test(content)) offenders.push(path);
		}
		expect(offenders).toEqual([]);
	});

	it("finds no blanket transitions or the retired legacy accent anywhere in the package", () => {
		const offenders: string[] = [];
		for (const path of [...sources, TOKENS_PATH]) {
			const content = readFileSync(path, "utf8");
			if (/\btransition-all\b|transition:\s*all\b|f97316/i.test(content)) offenders.push(path);
		}
		expect(offenders).toEqual([]);
	});

	it("finds no raw duration/delay utilities bypassing the motion tokens", () => {
		// duration-0 stays legal for intentionally-instant states.
		const offenders: string[] = [];
		for (const path of sources) {
			const content = readFileSync(path, "utf8");
			const match = content.match(/\b(?:duration|delay)-\d{2,}\b/);
			if (match !== null) offenders.push(`${path}: ${match[0]}`);
		}
		expect(offenders).toEqual([]);
	});
});
