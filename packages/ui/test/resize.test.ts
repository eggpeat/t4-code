import { describe, expect, it } from "vite-plus/test";

import { clampWidth, parsePersistedWidth, resolveDragWidth } from "../src/layout/resize.ts";

const BOUNDS = { minWidth: 208, maxWidth: 480, defaultWidth: 256 };

describe("clampWidth", () => {
	it("clamps to bounds", () => {
		expect(clampWidth(100, BOUNDS)).toBe(208);
		expect(clampWidth(9999, BOUNDS)).toBe(480);
		expect(clampWidth(300, BOUNDS)).toBe(300);
		expect(clampWidth(208, BOUNDS)).toBe(208);
		expect(clampWidth(480, BOUNDS)).toBe(480);
	});

	it("falls back to the default for non-finite input", () => {
		expect(clampWidth(Number.NaN, BOUNDS)).toBe(256);
		expect(clampWidth(Number.POSITIVE_INFINITY, BOUNDS)).toBe(256);
		expect(clampWidth(Number.NEGATIVE_INFINITY, BOUNDS)).toBe(256);
	});
});

describe("resolveDragWidth", () => {
	it("grows a left-edge (right-anchored) panel when dragging left", () => {
		expect(resolveDragWidth("left", 500, 460, 300, BOUNDS)).toBe(340);
		expect(resolveDragWidth("left", 500, 540, 300, BOUNDS)).toBe(260);
	});

	it("grows a right-edge (left-anchored) panel when dragging right", () => {
		expect(resolveDragWidth("right", 500, 540, 300, BOUNDS)).toBe(340);
		expect(resolveDragWidth("right", 500, 460, 300, BOUNDS)).toBe(260);
	});

	it("clamps drag results at both bounds", () => {
		expect(resolveDragWidth("right", 0, 10_000, 300, BOUNDS)).toBe(480);
		expect(resolveDragWidth("right", 10_000, 0, 300, BOUNDS)).toBe(208);
	});
});

describe("parsePersistedWidth", () => {
	it("returns the default when nothing is stored", () => {
		expect(parsePersistedWidth(null, BOUNDS)).toBe(256);
	});

	it("parses and clamps stored numbers", () => {
		expect(parsePersistedWidth("312", BOUNDS)).toBe(312);
		expect(parsePersistedWidth("64", BOUNDS)).toBe(208);
		expect(parsePersistedWidth("1000", BOUNDS)).toBe(480);
	});

	it("falls back on garbage", () => {
		expect(parsePersistedWidth("not-a-number", BOUNDS)).toBe(256);
		expect(parsePersistedWidth("", BOUNDS)).toBe(256);
	});
});
