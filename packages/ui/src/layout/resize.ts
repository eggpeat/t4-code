// Pure resize math shared by resize hooks. Extracted from T3 Code
// apps/web/src/hooks/useResizableWidth.ts (MIT, T3 Tools Inc.) so bounds
// behavior is testable without a DOM.

export interface WidthBounds {
	readonly minWidth: number;
	readonly maxWidth: number;
	readonly defaultWidth: number;
}

/** Non-finite input falls back to the default; otherwise clamp to bounds. */
export function clampWidth(value: number, bounds: WidthBounds): number {
	if (!Number.isFinite(value)) return bounds.defaultWidth;
	return Math.max(bounds.minWidth, Math.min(bounds.maxWidth, value));
}

/**
 * Width under drag. A "left" edge handle grows the panel as the pointer moves
 * left (right-anchored panels); "right" grows it as the pointer moves right.
 */
export function resolveDragWidth(
	edge: "left" | "right",
	startX: number,
	clientX: number,
	startWidth: number,
	bounds: WidthBounds,
): number {
	const delta = edge === "left" ? startX - clientX : clientX - startX;
	return clampWidth(startWidth + delta, bounds);
}

/** Parse a persisted width; anything non-numeric falls back to the default. */
export function parsePersistedWidth(raw: string | null, bounds: WidthBounds): number {
	// Number("") is 0 — treat blank storage as unset, not zero width.
	if (raw === null || raw.trim().length === 0) return bounds.defaultWidth;
	const parsed = Number(raw);
	return clampWidth(parsed, bounds);
}
