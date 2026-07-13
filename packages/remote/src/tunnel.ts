import { type ProcessHandle, type ProcessRunner } from "./process.ts";
import { buildSshArgv, type SshTarget, SshReadinessError } from "./ssh.ts";

export const DEFAULT_REMOTE_PORT = 3773;
export const SSH_READY_TIMEOUT_MS = 20_000;
export const REMOTE_READY_TIMEOUT_MS = 15_000;
export const SSH_READY_PROBE_TIMEOUT_MS = 1_000;

export interface Clock {
  now(): number;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

export const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms, signal) => promiseSleep(ms, signal),
};

function promiseSleep(ms: number, signal?: AbortSignal): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  if (signal?.aborted) {
    reject(new DOMException("The operation was aborted.", "AbortError"));
    return promise;
  }
  const timer = setTimeout(resolve, ms);
  const onAbort = () => {
    clearTimeout(timer);
    reject(new DOMException("The operation was aborted.", "AbortError"));
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  promise.finally(() => signal?.removeEventListener("abort", onAbort)).catch(() => undefined);
  return promise;
}

export interface HttpHealth {
  readonly ready: true;
  readonly protocolVersion: number;
  readonly hostId: string;
}
export type HttpProbe = (url: string, signal: AbortSignal) => Promise<HttpHealth | false>;
export const defaultHttpProbe: HttpProbe = async (url, signal) => {
  const response = await fetch(url, { method: "GET", signal, redirect: "manual" });
  if (response.status < 200 || response.status >= 400) return false;
  const body = await response.json() as Partial<HttpHealth>;
  if (body.ready !== true || body.protocolVersion !== 1 || typeof body.hostId !== "string" || !body.hostId) return false;
  return body as HttpHealth;
};
function abortError(): Error {
  return new DOMException("The operation was aborted.", "AbortError");
}
export async function waitForHttpReady(input: { readonly baseUrl: string; readonly expectedHostId: string; readonly protocolVersion?: number; readonly timeoutMs?: number; readonly intervalMs?: number; readonly probeTimeoutMs?: number; readonly probe?: HttpProbe; readonly clock?: Clock; readonly signal?: AbortSignal }): Promise<void> {
  const baseUrl = resolveLoopbackSshHttpBaseUrl(input.baseUrl);
  const timeoutMs = input.timeoutMs ?? REMOTE_READY_TIMEOUT_MS;
  const intervalMs = input.intervalMs ?? 250;
  const probeTimeoutMs = input.probeTimeoutMs ?? SSH_READY_PROBE_TIMEOUT_MS;
  const clock = input.clock ?? realClock;
  const probe = input.probe ?? defaultHttpProbe;
  const started = clock.now();
  let lastFailure = "no response";
  while (clock.now() - started <= timeoutMs) {
    if (input.signal?.aborted) throw abortError();
    const probeController = new AbortController();
    const timer = setTimeout(() => probeController.abort(), probeTimeoutMs);
    const abortProbe = () => probeController.abort();
    const unlink = () => input.signal?.removeEventListener("abort", abortProbe);
    input.signal?.addEventListener("abort", abortProbe, { once: true });
    try {
      const health = await probe(new URL("/.well-known/omp/health", baseUrl).toString(), probeController.signal);
      if (health && health.ready === true && health.protocolVersion === (input.protocolVersion ?? 1) && health.hostId === input.expectedHostId) return;
      lastFailure = "backend identity/protocol not ready";
    } catch (cause) {
      lastFailure = cause instanceof Error ? cause.name : "probe failed";
    } finally {
      clearTimeout(timer);
      unlink();
    }
    const remaining = timeoutMs - (clock.now() - started);
    if (remaining <= 0) break;
    await clock.sleep(Math.min(intervalMs, remaining), input.signal).catch((cause) => {
      if (input.signal?.aborted) throw abortError();
      throw cause;
    });
  }
  throw new SshReadinessError(`Backend readiness probe timed out after ${timeoutMs}ms.`, { url: baseUrl, timeoutMs, lastFailure });
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase().replace(/^\[(.*)\]$/u, "$1");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

export function resolveLoopbackSshHttpBaseUrl(rawHttpBaseUrl: unknown): string {
  if (typeof rawHttpBaseUrl !== "string" || !rawHttpBaseUrl.trim()) throw new SshReadinessError("SSH HTTP bridge URL is missing.", { url: "", timeoutMs: 0 });
  let url: URL;
  try {
    url = new URL(rawHttpBaseUrl);
  } catch (cause) {
    throw new SshReadinessError("SSH HTTP bridge URL is invalid.", { url: "", timeoutMs: 0 }, cause);
  }
  if (url.protocol !== "http:" || !isLoopbackHostname(url.hostname) || url.username || url.password || url.hostname === "0.0.0.0") {
    throw new SshReadinessError("SSH HTTP bridge must use an unauthenticated loopback HTTP URL.", { url: "", timeoutMs: 0 });
  }
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/u, "") || "/";
  return url.toString();
}

export interface SshTunnelHandle {
  readonly localUrl: string;
  readonly stop: () => Promise<void>;
}

export class SshTunnelError extends Error {
  readonly tag = "SshTunnelError" as const;
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "SshTunnelError";
  }
}

export function buildSshTunnelArgv(input: { readonly target: SshTarget; readonly localPort: number; readonly remotePort?: number; readonly platform?: NodeJS.Platform }): { readonly command: string; readonly args: readonly string[] } {
  const localPort = input.localPort;
  const remotePort = input.remotePort ?? DEFAULT_REMOTE_PORT;
  if (!Number.isInteger(localPort) || localPort < 1 || localPort > 65535 || !Number.isInteger(remotePort) || remotePort < 1 || remotePort > 65535) throw new RangeError("Tunnel ports must be between 1 and 65535.");
  const argv = buildSshArgv(input.target, { ...(input.platform === undefined ? {} : { platform: input.platform }), batchMode: "yes", preHostArgs: ["-N", "-T", "-o", "ExitOnForwardFailure=yes", "-L", `127.0.0.1:${localPort}:127.0.0.1:${remotePort}`] });
  return argv;
}

export async function startSshTunnel(input: { readonly target: SshTarget; readonly localPort: number; readonly remotePort?: number; readonly runner: ProcessRunner; readonly readinessUrl?: string; readonly expectedHostId: string; readonly readinessTimeoutMs?: number; readonly signal?: AbortSignal; readonly probe?: HttpProbe; readonly clock?: Clock }): Promise<SshTunnelHandle> {
  const argv = buildSshTunnelArgv(input);
  let handle: ProcessHandle;
  try {
    handle = await input.runner.spawn({ command: argv.command, args: argv.args }, input.signal);
  } catch (cause) {
    throw new SshTunnelError("Failed to start SSH tunnel.", cause);
  }
  const localUrl = resolveLoopbackSshHttpBaseUrl(input.readinessUrl ?? `http://127.0.0.1:${input.localPort}/`);
  try {
    const readiness = waitForHttpReady({
      baseUrl: localUrl,
      expectedHostId: input.expectedHostId,
      timeoutMs: input.readinessTimeoutMs ?? SSH_READY_TIMEOUT_MS,
      ...(input.probe === undefined ? {} : { probe: input.probe }),
      ...(input.clock === undefined ? {} : { clock: input.clock }),
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });
    const exited = handle.result.then(() => { throw new SshTunnelError("SSH tunnel exited before readiness."); });
    await Promise.race([readiness, exited]);
  } catch (cause) {
    handle.kill();
    await handle.result.catch(() => undefined);
    throw cause;
  }
  let stopped = false;
  return { localUrl, stop: async () => { if (stopped) return; stopped = true; handle.kill(); await handle.result.catch(() => undefined); } };
}

export function describeReadinessCause(error: unknown): string {
  if (error instanceof SshReadinessError) return error.message;
  if (error instanceof Error && error.name === "AbortError") return "Readiness probe was cancelled.";
  return "Readiness probe failed.";
}
