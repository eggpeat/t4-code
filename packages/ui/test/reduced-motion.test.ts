import { describe, expect, it } from "vite-plus/test";

import { resolveReducedMotion } from "../src/motion/useReducedMotion.ts";

describe("resolveReducedMotion", () => {
	it("follows the system preference without an override", () => {
		expect(resolveReducedMotion(true)).toBe(true);
		expect(resolveReducedMotion(false)).toBe(false);
	});

	it("a reduce override wins even when the system allows motion", () => {
		expect(resolveReducedMotion(false, "reduce")).toBe(true);
	});

	it("a no-preference override wins even when the system reduces", () => {
		expect(resolveReducedMotion(true, "no-preference")).toBe(false);
	});
});
