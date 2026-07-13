// Fixture boot switches: URL query parameters that pin the shell into an
// exact state for screenshots and QA. Only the fixture bridge reads these;
// a desktop-injected bridge ignores them entirely.
import type { ShellPlatform } from "../platform/bridge.ts";
import type { ThemePreference } from "../state/workspace-store.ts";

export interface FixtureBootOptions {
  readonly theme: ThemePreference | null;
  readonly platform: ShellPlatform | null;
  /** Start with the right pane open on the given family for the active session. */
  readonly pane: string | null;
  readonly terminalDrawer: boolean;
  readonly railCollapsed: boolean;
  /** Discard persisted view state before booting. */
  readonly reset: boolean;
  readonly session: string | null;
}

export function parseFixtureBootOptions(search: string): FixtureBootOptions {
  const params = new URLSearchParams(search);
  const theme = params.get("theme");
  const platform = params.get("platform");
  return {
    theme: theme === "light" || theme === "dark" || theme === "system" ? theme : null,
    platform: platform === "linux" || platform === "darwin" ? platform : null,
    pane: params.get("pane"),
    terminalDrawer: params.get("drawer") === "open",
    railCollapsed: params.get("rail") === "collapsed",
    reset: params.get("reset") === "1",
    session: params.get("session"),
  };
}
