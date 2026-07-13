import { describe, expect, it } from "vite-plus/test";

import { cn } from "../src/lib/cn.ts";

describe("cn", () => {
	it("merges conflicting tailwind utilities, last wins", () => {
		expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
	});

	it("drops falsy conditionals", () => {
		const active = false;
		expect(cn("text-sm", active && "font-bold", undefined, null)).toBe("text-sm");
	});

	it("flattens arrays and objects", () => {
		expect(cn(["flex", { hidden: false, "gap-2": true }])).toBe("flex gap-2");
	});

	it("keeps non-conflicting custom-property utilities", () => {
		expect(cn("before:shadow-(--surface-edge-shadow)", "bg-primary")).toBe(
			"before:shadow-(--surface-edge-shadow) bg-primary",
		);
	});
});
