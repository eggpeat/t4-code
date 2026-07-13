import { describe, expect, it } from "vite-plus/test";

import { createXtermTheme, isRenderableColor, XTERM_TOKEN_MAP } from "../src/terminal/xtermTheme.ts";

describe("createXtermTheme", () => {
	it("resolves every mapped ITheme key through its --terminal-* token", () => {
		const requested: string[] = [];
		const theme = createXtermTheme((tokenName) => {
			requested.push(tokenName);
			return `resolved(${tokenName})`;
		});
		expect(requested.sort()).toEqual(Object.values(XTERM_TOKEN_MAP).sort());
		expect(theme.background).toBe("resolved(--terminal-background)");
		expect(theme.brightWhite).toBe("resolved(--terminal-ansi-bright-white)");
	});

	it("omits unresolvable tokens so xterm keeps its defaults", () => {
		const theme = createXtermTheme((tokenName) =>
			tokenName === "--terminal-cursor" ? "" : "  rgb(1, 2, 3) ",
		);
		expect(theme.cursor).toBeUndefined();
		expect(theme.foreground).toBe("rgb(1, 2, 3)");
	});
});

describe("isRenderableColor", () => {
	it("rejects transparent and empty computed colors", () => {
		expect(isRenderableColor("")).toBe(false);
		expect(isRenderableColor("  ")).toBe(false);
		expect(isRenderableColor("transparent")).toBe(false);
		expect(isRenderableColor("rgba(0, 0, 0, 0)")).toBe(false);
	});

	it("accepts real colors", () => {
		expect(isRenderableColor("rgb(255, 255, 255)")).toBe(true);
		expect(isRenderableColor("rgb(14, 18, 24)")).toBe(true);
	});
});
