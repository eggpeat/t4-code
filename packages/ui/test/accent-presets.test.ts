// Accent preset accessibility contract: every [data-accent] preset in
// tokens.css ships AA-safe pairs in both themes — primary vs its foreground
// ≥ 4.5:1 (text), accent-text vs the theme background ≥ 4.5:1 (text), and
// primary vs the theme background ≥ 3:1 (focus ring / UI). The :root/.dark
// defaults must equal the Pi Pink preset so a boot without data-accent is
// identical to the default preference.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";

const TOKENS_PATH = fileURLToPath(new URL("../src/tokens.css", import.meta.url));
const tokensCss = readFileSync(TOKENS_PATH, "utf8");

const PRESETS = ["pi-pink", "magenta", "violet", "cobalt", "teal", "mono"] as const;

// ─── Block/token extraction ────────────────────────────────────────────────

function extractBlock(selector: string): string {
	const start = tokensCss.indexOf(`${selector} {`);
	expect(start, `block "${selector}" exists`).toBeGreaterThanOrEqual(0);
	const end = tokensCss.indexOf("}", start);
	return tokensCss.slice(start, end + 1);
}

function tokenValue(block: string, name: string): string {
	const match = block.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
	expect(match, `${name} declared`).not.toBeNull();
	return (match as RegExpMatchArray)[1]!.trim();
}

// The color-bearing :root block declares --background; the geometry :root
// block does not.
const rootBlocks = [...tokensCss.matchAll(/(?<![-\w.]):root \{/g)].map((match) => {
	const start = match.index;
	// Brace-match: these blocks contain no nested braces.
	const end = tokensCss.indexOf("\n}", start);
	return tokensCss.slice(start, end + 2);
});
const lightRoot = rootBlocks.find((block) => block.includes("--background:")) ?? "";
const darkRoot = (() => {
	const start = tokensCss.indexOf(".dark {");
	const end = tokensCss.indexOf("\n}", start);
	return tokensCss.slice(start, end + 2);
})();

// ─── Color math (oklch → linear sRGB → WCAG relative luminance) ────────────

function oklchToLinearSrgb(L: number, C: number, H: number): [number, number, number] {
	const h = (H * Math.PI) / 180;
	const a = C * Math.cos(h);
	const b = C * Math.sin(h);
	const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
	const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
	const s_ = L - 0.0894841775 * a - 1.291485548 * b;
	const l = l_ ** 3;
	const m = m_ ** 3;
	const s = s_ ** 3;
	return [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
	];
}

function srgbChannelToLinear(v: number): number {
	return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function linearToSrgbChannel(v: number): number {
	return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
}

/** Parse a token value (hex or oklch) into gamma-encoded sRGB channels 0..1. */
function parseColor(value: string): [number, number, number] {
	const hex = value.match(/^#([0-9a-fA-F]{6})$/);
	if (hex !== null) {
		const n = hex[1] as string;
		return [0, 2, 4].map((i) => Number.parseInt(n.slice(i, i + 2), 16) / 255) as [
			number,
			number,
			number,
		];
	}
	const oklch = value.match(/^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/);
	expect(oklch, `parseable color: ${value}`).not.toBeNull();
	const [L, C, H] = (oklch as RegExpMatchArray).slice(1, 4).map(Number) as [
		number,
		number,
		number,
	];
	const linear = oklchToLinearSrgb(L, C, H);
	// The preset values are chosen in-gamut; a clamp here would silently skew
	// the contrast claim, so out-of-gamut is a test failure.
	for (const channel of linear) {
		expect(channel, `${value} stays inside sRGB`).toBeGreaterThanOrEqual(-0.001);
		expect(channel, `${value} stays inside sRGB`).toBeLessThanOrEqual(1.001);
	}
	return linear.map((c) => linearToSrgbChannel(Math.min(1, Math.max(0, c)))) as [
		number,
		number,
		number,
	];
}

function luminance(srgb: [number, number, number]): number {
	const [r, g, b] = srgb.map(srgbChannelToLinear) as [number, number, number];
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: number, b: number): number {
	const [hi, lo] = a > b ? [a, b] : [b, a];
	return (hi + 0.05) / (lo + 0.05);
}

// Theme backgrounds. Dark is color-mix(in srgb, oklch(0.145 0 0) 95%, #ffffff):
// reproduce the mix in gamma-encoded sRGB, the same space the browser uses.
const LIGHT_BG = luminance([1, 1, 1]);
const DARK_BG = (() => {
	const base = oklchToLinearSrgb(0.145, 0, 0).map((c) =>
		linearToSrgbChannel(Math.min(1, Math.max(0, c))),
	);
	return luminance(base.map((c) => c * 0.95 + 0.05) as [number, number, number]);
})();

// ─── Contracts ─────────────────────────────────────────────────────────────

describe("accent presets", () => {
	for (const preset of PRESETS) {
		const light = extractBlock(`[data-accent="${preset}"]`);
		const dark = extractBlock(`.dark[data-accent="${preset}"],\n.dark [data-accent="${preset}"]`);

		it(`${preset}: light pairs meet AA (text ≥ 4.5, focus ≥ 3)`, () => {
			const primary = luminance(parseColor(tokenValue(light, "--primary")));
			const foreground = luminance(parseColor(tokenValue(light, "--primary-foreground")));
			const accentText = luminance(parseColor(tokenValue(light, "--accent-text")));
			expect(contrast(primary, foreground)).toBeGreaterThanOrEqual(4.5);
			expect(contrast(accentText, LIGHT_BG)).toBeGreaterThanOrEqual(4.5);
			expect(contrast(primary, LIGHT_BG)).toBeGreaterThanOrEqual(3);
		});

		it(`${preset}: dark pairs meet AA (text ≥ 4.5, focus ≥ 3)`, () => {
			const primary = luminance(parseColor(tokenValue(dark, "--primary")));
			const foreground = luminance(parseColor(tokenValue(dark, "--primary-foreground")));
			const accentText = luminance(parseColor(tokenValue(dark, "--accent-text")));
			expect(contrast(primary, foreground)).toBeGreaterThanOrEqual(4.5);
			expect(contrast(accentText, DARK_BG)).toBeGreaterThanOrEqual(4.5);
			expect(contrast(primary, DARK_BG)).toBeGreaterThanOrEqual(3);
		});
	}

	it("Pi Pink is the default: :root and .dark match the pi-pink preset", () => {
		const lightPreset = extractBlock('[data-accent="pi-pink"]');
		const darkPreset = extractBlock(
			'.dark[data-accent="pi-pink"],\n.dark [data-accent="pi-pink"]',
		);
		for (const name of ["--primary", "--primary-foreground", "--accent-text"]) {
			expect(tokenValue(lightRoot, name)).toBe(tokenValue(lightPreset, name));
			expect(tokenValue(darkRoot, name)).toBe(tokenValue(darkPreset, name));
		}
	});

	it("declares soft and selection tokens derived from the accent in both themes", () => {
		for (const block of [lightRoot, darkRoot]) {
			expect(tokenValue(block, "--accent-soft")).toContain("var(--primary)");
			expect(tokenValue(block, "--selection")).toContain("var(--primary)");
		}
	});
});
