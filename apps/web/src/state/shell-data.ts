// The one seam components read workspace display data through. Desktop mode
// projects the live runtime snapshot; browser mode serves the built-in
// sample workspace. Nothing above this file knows which provider fed it,
// and the desktop path never reads fixture data.
import type { WorkspaceData } from "../lib/workspace-data.ts";
import { desktopRuntime, useDesktopRuntimeSnapshot } from "../platform/desktop-runtime.ts";
import { deriveWorkspaceData } from "../platform/live-workspace.ts";
import { SHELL_FIXTURE } from "../fixture/data.ts";

/** Reactive workspace data for components. */
export function useShellData(): WorkspaceData {
  const snapshot = useDesktopRuntimeSnapshot();
  return snapshot === null ? SHELL_FIXTURE : deriveWorkspaceData(snapshot);
}

/** Point-in-time workspace data for event handlers outside render. */
export function getShellData(): WorkspaceData {
  const controller = desktopRuntime();
  return controller === null ? SHELL_FIXTURE : deriveWorkspaceData(controller.getSnapshot());
}
