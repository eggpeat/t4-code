import { homedir } from "node:os";
import { join } from "node:path";

export interface UnixSocketPolicy {
  readonly platform?: NodeJS.Platform;
  readonly homeDirectory?: string;
  readonly runtimeDirectory?: string;
}

export function localSocketPath(policy: UnixSocketPolicy = {}): string {
  const platform = policy.platform ?? process.platform;
  if (platform === "darwin") return join(policy.homeDirectory ?? homedir(), ".omp", "run", "appserver.sock");
  if (platform !== "linux") throw new Error("local appserver is supported only on Linux and macOS");
  const runtime = policy.runtimeDirectory ?? process.env.XDG_RUNTIME_DIR;
  if (runtime === undefined || runtime.length === 0 || !runtime.startsWith("/")) throw new Error("XDG_RUNTIME_DIR must be an absolute path");
  return join(runtime, "omp", "appserver.sock");
}
