// Session status taxonomy. Adapted from T3 Code
// apps/web/src/components/Sidebar.logic.ts `ThreadStatusPill` (MIT, T3 Tools
// Inc.). Single source of truth for status colors app-wide (rail pills,
// composer panels, agent rows, toasts). Brand and accent hues are banned
// here: status stays semantic, Pi Pink stays identity/accent.

export type SessionStatus =
	| "working"
	| "connecting"
	| "pendingApproval"
	| "awaitingInput"
	| "planReady"
	| "completed"
	| "error";

export interface StatusPillStyle {
	/** Human-visible label; plain language, sentence case. */
	readonly label: string;
	/** Text color class (token-backed; no raw colors). */
	readonly colorClass: string;
	/** Indicator dot fill class (token-backed; no raw colors). */
	readonly dotClass: string;
	/** Live pulse on the dot; must degrade under reduced motion. */
	readonly pulse: boolean;
}

export const STATUS_PRIORITY: Record<SessionStatus, number> = {
	error: 6,
	pendingApproval: 5,
	awaitingInput: 4,
	working: 3,
	connecting: 3,
	planReady: 2,
	completed: 1,
};

export const STATUS_PILLS: Record<SessionStatus, StatusPillStyle> = {
	working: {
		label: "Working",
		colorClass: "text-status-working",
		dotClass: "bg-status-working-dot",
		pulse: true,
	},
	connecting: {
		label: "Connecting",
		colorClass: "text-status-working",
		dotClass: "bg-status-working-dot",
		pulse: true,
	},
	pendingApproval: {
		label: "Pending approval",
		colorClass: "text-status-approval",
		dotClass: "bg-status-approval-dot",
		pulse: false,
	},
	awaitingInput: {
		label: "Awaiting input",
		colorClass: "text-status-input",
		dotClass: "bg-status-input-dot",
		pulse: false,
	},
	planReady: {
		label: "Plan ready",
		colorClass: "text-status-plan",
		dotClass: "bg-status-plan-dot",
		pulse: false,
	},
	completed: {
		label: "Completed",
		colorClass: "text-status-done",
		dotClass: "bg-status-done-dot",
		pulse: false,
	},
	error: {
		label: "Error",
		colorClass: "text-status-error",
		dotClass: "bg-status-error-dot",
		pulse: false,
	},
};

/**
 * Collapse many session statuses into the one a parent row (project group,
 * host) should surface. Adapted from T3 `resolveProjectStatusIndicator`.
 */
export function resolveHighestPriorityStatus(
	statuses: ReadonlyArray<SessionStatus | null>,
): SessionStatus | null {
	let highest: SessionStatus | null = null;
	for (const status of statuses) {
		if (status === null) continue;
		if (highest === null || STATUS_PRIORITY[status] > STATUS_PRIORITY[highest]) {
			highest = status;
		}
	}
	return highest;
}
