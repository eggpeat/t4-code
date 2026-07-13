// xterm theme derived from the --terminal-* tokens in tokens.css — the single
// dark/light palette rule (no second palette in terminal code). Palette values
// adapted from T3 Code apps/web/src/components/ThreadTerminalDrawer.tsx
// `terminalThemeFromApp` (MIT, T3 Tools Inc.).
import type { ITheme } from "@xterm/xterm";

export const XTERM_TOKEN_MAP = {
	background: "--terminal-background",
	foreground: "--terminal-foreground",
	cursor: "--terminal-cursor",
	selectionBackground: "--terminal-selection",
	scrollbarSliderBackground: "--terminal-scrollbar",
	scrollbarSliderHoverBackground: "--terminal-scrollbar-hover",
	scrollbarSliderActiveBackground: "--terminal-scrollbar-active",
	black: "--terminal-ansi-black",
	red: "--terminal-ansi-red",
	green: "--terminal-ansi-green",
	yellow: "--terminal-ansi-yellow",
	blue: "--terminal-ansi-blue",
	magenta: "--terminal-ansi-magenta",
	cyan: "--terminal-ansi-cyan",
	white: "--terminal-ansi-white",
	brightBlack: "--terminal-ansi-bright-black",
	brightRed: "--terminal-ansi-bright-red",
	brightGreen: "--terminal-ansi-bright-green",
	brightYellow: "--terminal-ansi-bright-yellow",
	brightBlue: "--terminal-ansi-bright-blue",
	brightMagenta: "--terminal-ansi-bright-magenta",
	brightCyan: "--terminal-ansi-bright-cyan",
	brightWhite: "--terminal-ansi-bright-white",
} as const satisfies { [K in keyof ITheme]?: string };

export type ReadToken = (tokenName: string) => string;

/**
 * Build an xterm ITheme by resolving each --terminal-* token through
 * `readToken`. Unresolvable tokens are omitted so xterm falls back to its own
 * defaults instead of receiving empty strings.
 */
export function createXtermTheme(readToken: ReadToken): ITheme {
	const theme: Pick<ITheme, keyof typeof XTERM_TOKEN_MAP> = {};
	for (const key of Object.keys(XTERM_TOKEN_MAP) as Array<keyof typeof XTERM_TOKEN_MAP>) {
		const value = readToken(XTERM_TOKEN_MAP[key]).trim();
		if (value.length > 0) theme[key] = value;
	}
	return theme;
}

/** Transparent/unset computed colors are useless to xterm; drop them. */
export function isRenderableColor(value: string): boolean {
	const normalized = value.trim().toLowerCase();
	if (normalized.length === 0 || normalized === "transparent") return false;
	// Fully transparent computed colors: all-zero channels with zero alpha.
	return !/^rgba?\(\s*0[\s,]+0[\s,]+0\s*[,/]\s*0(?:\.0+)?\s*\)$/.test(normalized);
}

/**
 * Resolve the theme from computed styles at (or above) the terminal mount so
 * `.dark` and any scoped overrides apply. Background/foreground come from the
 * element's USED colors (custom properties keep color-mix expressions
 * unevaluated, which xterm cannot parse — T3 does the same). Call again on
 * theme flips and
 * pass the result to `terminal.options.theme`.
 */
export function xtermThemeFromElement(element?: HTMLElement | null): ITheme {
	const target = element ?? document.body;
	const styles = getComputedStyle(target);
	const theme = createXtermTheme((tokenName) => styles.getPropertyValue(tokenName));
	if (isRenderableColor(styles.backgroundColor)) theme.background = styles.backgroundColor;
	if (isRenderableColor(styles.color)) theme.foreground = styles.color;
	return theme;
}
