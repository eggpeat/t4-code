import { useSyncExternalStore } from "react";

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export type MotionPreference = "reduce" | "no-preference";

/**
 * Pure resolution: an explicit override (per-surface or test-forced) beats the
 * system preference.
 */
export function resolveReducedMotion(
	systemPrefersReduced: boolean,
	override?: MotionPreference,
): boolean {
	if (override === "reduce") return true;
	if (override === "no-preference") return false;
	return systemPrefersReduced;
}

// Module-level callbacks: useSyncExternalStore requires referential identity
// across renders.
function subscribe(onChange: () => void): () => void {
	const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
	mediaQuery.addEventListener("change", onChange);
	return () => mediaQuery.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
	return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function getServerSnapshot(): boolean {
	return false;
}

/**
 * Live `prefers-reduced-motion` state. Components that animate imperatively
 * (scroll-follow, xterm refit, JS-driven pings) branch on this; CSS-only
 * motion is already covered by the motion-duration tokens and
 * `motion-reduce:` variants in tokens.css.
 */
export function useReducedMotion(override?: MotionPreference): boolean {
	const system = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
	return resolveReducedMotion(system, override);
}
