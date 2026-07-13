// Adapted from T3 Code apps/web/src/hooks/useResizableWidth.ts (MIT, T3 Tools
// Inc.). OMP changes: effect/Schema localStorage codec replaced with the pure
// helpers in resize.ts; behavior (live drag width, persist on drag-end only,
// cancelled drags revert) kept 1:1.
import { type PointerEvent as ReactPointerEvent, useCallback, useRef, useState } from "react";

import { clampWidth, parsePersistedWidth, resolveDragWidth, type WidthBounds } from "./resize.ts";

export interface UseResizableWidthOptions {
	/** localStorage key the persisted width is stored under. */
	readonly storageKey: string;
	readonly defaultWidth: number;
	readonly minWidth: number;
	readonly maxWidth: number;
	/**
	 * Which edge of the host element carries the drag handle:
	 *   - "left"  → panel grows leftward (right-anchored panels)
	 *   - "right" → panel grows rightward (left-anchored panels)
	 */
	readonly edge: "left" | "right";
}

export interface ResizableWidthHandlers {
	readonly onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
	readonly onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
	readonly onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
	readonly onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
}

/**
 * Width state for a side-anchored panel resized via a drag handle on the
 * specified edge. Width is read from localStorage on mount and persisted on
 * drag-end (not on every rAF tick — would otherwise be ~60 writes/sec).
 *
 * The hook updates an internal `width` state during drag (so the panel
 * follows the cursor live) and only commits to localStorage when the user
 * lifts the pointer.
 */
export function useResizableWidth(options: UseResizableWidthOptions): {
	readonly width: number;
	readonly handlers: ResizableWidthHandlers;
} {
	const { storageKey, defaultWidth, minWidth, maxWidth, edge } = options;
	const bounds: WidthBounds = { minWidth, maxWidth, defaultWidth };

	// No cross-tab subscription: panel width is per-window state.
	const [width, setWidth] = useState<number>(() => {
		if (typeof window === "undefined") return defaultWidth;
		try {
			return parsePersistedWidth(window.localStorage.getItem(storageKey), bounds);
		} catch (error) {
			console.error("Could not read persisted panel width.", error);
			return defaultWidth;
		}
	});

	const clampedWidth = clampWidth(width, bounds);

	const dragStateRef = useRef<{
		pointerId: number;
		startX: number;
		startWidth: number;
		pending: number;
		rafId: number | null;
		target: HTMLElement;
	} | null>(null);

	const releasePointer = useCallback((pointerId: number) => {
		const state = dragStateRef.current;
		if (!state) return;
		if (state.rafId !== null) {
			cancelAnimationFrame(state.rafId);
		}
		try {
			if (state.target.hasPointerCapture(pointerId)) {
				state.target.releasePointerCapture(pointerId);
			}
		} catch {
			// pointer may already be released; harmless.
		}
		document.body.style.removeProperty("cursor");
		document.body.style.removeProperty("user-select");
		dragStateRef.current = null;
	}, []);

	const onPointerDown = useCallback(
		(event: ReactPointerEvent<HTMLElement>) => {
			if (event.button !== 0) return;
			event.preventDefault();
			event.stopPropagation();
			const target = event.currentTarget;
			try {
				target.setPointerCapture(event.pointerId);
			} catch {
				return;
			}
			document.body.style.cursor = "col-resize";
			document.body.style.userSelect = "none";
			dragStateRef.current = {
				pointerId: event.pointerId,
				startX: event.clientX,
				startWidth: clampedWidth,
				pending: clampedWidth,
				rafId: null,
				target,
			};
		},
		[clampedWidth],
	);

	const onPointerMove = useCallback(
		(event: ReactPointerEvent<HTMLElement>) => {
			const state = dragStateRef.current;
			if (!state || state.pointerId !== event.pointerId) return;
			event.preventDefault();
			state.pending = resolveDragWidth(edge, state.startX, event.clientX, state.startWidth, bounds);
			if (state.rafId !== null) return;
			state.rafId = requestAnimationFrame(() => {
				const active = dragStateRef.current;
				if (!active) return;
				active.rafId = null;
				setWidth(active.pending);
			});
		},
		[edge, minWidth, maxWidth, defaultWidth],
	);

	const onPointerUp = useCallback(
		(event: ReactPointerEvent<HTMLElement>) => {
			const state = dragStateRef.current;
			if (!state || state.pointerId !== event.pointerId) return;
			const finalWidth = clampWidth(state.pending, bounds);
			releasePointer(event.pointerId);
			// Commit once at drag-end to avoid 60Hz localStorage writes.
			try {
				window.localStorage.setItem(storageKey, String(finalWidth));
			} catch (error) {
				console.error("Could not persist panel width.", error);
			}
			setWidth(finalWidth);
		},
		[minWidth, maxWidth, defaultWidth, releasePointer, storageKey],
	);

	const onPointerCancel = useCallback(
		(event: ReactPointerEvent<HTMLElement>) => {
			const state = dragStateRef.current;
			if (!state || state.pointerId !== event.pointerId) return;
			// Don't persist a cancelled drag; revert to the start width.
			releasePointer(event.pointerId);
			setWidth(state.startWidth);
		},
		[releasePointer],
	);

	return {
		width: clampedWidth,
		handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
	};
}
