import { describe, expect, it } from "vite-plus/test";

import {
	resolveHighestPriorityStatus,
	type SessionStatus,
	STATUS_PILLS,
	STATUS_PRIORITY,
} from "../src/lib/status.ts";

const ALL_STATUSES = Object.keys(STATUS_PILLS) as SessionStatus[];

describe("status taxonomy", () => {
	it("orders attention: error > approval > input > working > plan > completed", () => {
		expect(STATUS_PRIORITY.error).toBeGreaterThan(STATUS_PRIORITY.pendingApproval);
		expect(STATUS_PRIORITY.pendingApproval).toBeGreaterThan(STATUS_PRIORITY.awaitingInput);
		expect(STATUS_PRIORITY.awaitingInput).toBeGreaterThan(STATUS_PRIORITY.working);
		expect(STATUS_PRIORITY.working).toBe(STATUS_PRIORITY.connecting);
		expect(STATUS_PRIORITY.working).toBeGreaterThan(STATUS_PRIORITY.planReady);
		expect(STATUS_PRIORITY.planReady).toBeGreaterThan(STATUS_PRIORITY.completed);
	});

	it("gives every status a text label, dot class, and color class", () => {
		for (const status of ALL_STATUSES) {
			const pill = STATUS_PILLS[status];
			expect(pill.label.length).toBeGreaterThan(0);
			expect(pill.colorClass).toMatch(/^text-status-/);
			expect(pill.dotClass).toMatch(/^bg-status-.*-dot$/);
		}
	});

	it("pulses only live states", () => {
		for (const status of ALL_STATUSES) {
			expect(STATUS_PILLS[status].pulse).toBe(status === "working" || status === "connecting");
		}
	});

	it("never styles a status with the brand accent", () => {
		for (const status of ALL_STATUSES) {
			const pill = STATUS_PILLS[status];
			expect(`${pill.colorClass} ${pill.dotClass}`).not.toMatch(/brand|primary|orange/);
		}
	});

	it("resolves the highest-priority status across sessions", () => {
		expect(resolveHighestPriorityStatus(["completed", "working", "pendingApproval"])).toBe(
			"pendingApproval",
		);
		expect(resolveHighestPriorityStatus(["planReady", null, "error"])).toBe("error");
		expect(resolveHighestPriorityStatus([null, null])).toBeNull();
		expect(resolveHighestPriorityStatus([])).toBeNull();
	});
});
