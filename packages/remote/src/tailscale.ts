import { NodePathProbe, type PathProbe, type ProcessRunner, runProcess, ProcessCancelledError, ProcessSpawnError, ProcessTimeoutError } from "./process.ts";

export const TAILSCALE_STATUS_TIMEOUT_MS = 1_500;
export const TAILSCALE_PROBE_TIMEOUT_MS = 2_500;
export const DEFAULT_TAILSCALE_SERVE_PORT = 443;

export interface TailscaleStatusSelf {
  readonly ID?: unknown;
  readonly DNSName?: unknown;
  readonly TailscaleIPs?: unknown;
  readonly HostName?: unknown;
  readonly UserID?: unknown;
  readonly OS?: unknown;
  readonly Online?: unknown;
  readonly Active?: unknown;
}

export interface TailscaleStatusPeer extends TailscaleStatusSelf {}
export interface TailscaleStatusUser {
  readonly LoginName?: unknown;
  readonly DisplayName?: unknown;
}

export interface TailscaleStatusJson {
  readonly Self?: TailscaleStatusSelf;
  readonly Peer?: Record<string, TailscaleStatusPeer>;
  readonly User?: Record<string, TailscaleStatusUser>;
}

export interface TailscalePeerSuggestion {
  readonly nodeId: string;
  readonly login: string | null;
  readonly os: string | null;
  readonly online: boolean;
  readonly active: boolean;
  readonly magicDnsName: string | null;
  readonly tailnetIpv4Addresses: readonly string[];
}

export interface TailscaleStatus {
  readonly magicDnsName: string | null;
  readonly tailnetIpv4Addresses: readonly string[];
  readonly peers?: readonly TailscalePeerSuggestion[];
}

export class TailscaleStatusParseError extends Error {
  readonly tag = "TailscaleStatusParseError" as const;
  override readonly cause: unknown;
  constructor(cause: unknown) {
    super("Failed to decode tailscale status JSON.", { cause });
    this.name = "TailscaleStatusParseError";
    this.cause = cause;
  }
}

export type TailscaleCommandName = "status";
export interface TailscaleCommandDetails {
  readonly exitCode?: number | null;
  readonly stdoutLength?: number;
  readonly stderrLength?: number;
  readonly timeoutMs?: number;
  readonly stream?: "stdout" | "stderr";
}
export class TailscaleCommandError extends Error {
  readonly tag = "TailscaleCommandError" as const;
  readonly commandName: TailscaleCommandName;
  readonly executable: string;
  readonly kind: "spawn" | "exit" | "timeout" | "cancelled" | "truncated";
  readonly details: TailscaleCommandDetails;
  constructor(commandName: TailscaleCommandName, executable: string, kind: "spawn" | "exit" | "timeout" | "cancelled" | "truncated", details: TailscaleCommandDetails, cause?: unknown) {
    const suffix = kind === "exit" ? ` exited with code ${details.exitCode}.` : kind === "timeout" ? ` timed out after ${details.timeoutMs}ms.` : kind === "cancelled" ? " was cancelled." : kind === "truncated" ? ` produced truncated ${details.stream ?? "command"} output.` : " failed to start.";
    super(`${executable} ${commandName}${suffix}`, { cause });
    this.name = "TailscaleCommandError";
    this.commandName = commandName;
    this.executable = executable;
    this.kind = kind;
    this.details = details;
  }
}

export class TailscaleCliNotFoundError extends Error {
  readonly tag = "TailscaleCliNotFoundError" as const;
  readonly candidates: readonly string[];
  constructor(candidates: readonly string[]) {
    super("Tailscale CLI was not found.");
    this.name = "TailscaleCliNotFoundError";
    this.candidates = candidates;
  }
}


export class TailscaleServeSuggestionError extends Error {
  readonly tag = "TailscaleServeSuggestionError" as const;
  constructor(message: string) {
    super(message);
    this.name = "TailscaleServeSuggestionError";
  }
}

export function tailscaleCommandCandidates(platform: NodeJS.Platform): readonly string[] {
  if (platform === "win32") return ["tailscale.exe", "tailscale"];
  if (platform === "darwin") return ["/Applications/Tailscale.app/Contents/MacOS/Tailscale", "/opt/homebrew/bin/tailscale", "/usr/local/bin/tailscale", "/usr/bin/tailscale", "tailscale"];
  return ["/usr/local/bin/tailscale", "/usr/bin/tailscale", "tailscale"];
}

export async function discoverTailscaleExecutable(input: {
  readonly platform?: NodeJS.Platform;
  readonly probe?: PathProbe;
} = {}): Promise<string> {
  const platform = input.platform ?? process.platform;
  const probe = input.probe ?? new NodePathProbe();
  const candidates = tailscaleCommandCandidates(platform);
  for (const candidate of candidates) {
    const found = candidate.startsWith("/") || candidate.includes("\\") ? await probe.exists(candidate) : await probe.which(candidate);
    if (found) return found === true ? candidate : found;
  }
  throw new TailscaleCliNotFoundError(candidates);
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

function safeString(value: unknown, max = 256): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max || hasControlCharacter(trimmed)) return null;
  return trimmed;
}

function normalizeDns(raw: unknown): string | null {
  const value = safeString(raw, 253)?.replace(/\.+$/u, "") ?? "";
  if (!value || /[\s/:@]/u.test(value) || !/^[A-Za-z0-9][A-Za-z0-9.-]*$/u.test(value)) return null;
  return value;
}

function normalizeMagicDnsName(status: TailscaleStatusJson): string | null {
  return normalizeDns(status.Self?.DNSName);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function decodeStatus(raw: string): TailscaleStatusJson {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new TailscaleStatusParseError(cause);
  }
  if (!isRecord(parsed)) throw new TailscaleStatusParseError(new TypeError("status must be an object"));
  for (const key of ["Self", "Peer", "User"] as const) {
    const value = parsed[key];
    if (value !== undefined && !isRecord(value)) throw new TailscaleStatusParseError(new TypeError(`${key} must be an object`));
  }
  return parsed as TailscaleStatusJson;
}

export function parseTailscaleMagicDnsName(rawStatusJson: string): string | null {
  return normalizeMagicDnsName(decodeStatus(rawStatusJson));
}

export function isTailscaleIpv4Address(address: string): boolean {
  const parts = address.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/u.test(part))) return false;
  const values = parts.map(Number);
  const [first, second] = values;
  return values.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) && first === 100 && second !== undefined && second >= 64 && second <= 127;
}

export function parseTailscaleStatus(rawStatusJson: string): TailscaleStatus {
  const parsed = decodeStatus(rawStatusJson);
  const self = parsed.Self;
  const selfId = safeString(self?.ID, 256);
  const rawIps = self?.TailscaleIPs;
  const tailnetIpv4Addresses = [...new Set(Array.isArray(rawIps)
    ? rawIps.filter((address): address is string => typeof address === "string" && isTailscaleIpv4Address(address))
    : [])].sort();
  const users = parsed.User ?? {};
  const peersById = new Map<string, TailscalePeerSuggestion>();
  for (const [key, rawPeer] of Object.entries(parsed.Peer ?? {})) {
    if (!isRecord(rawPeer)) continue;
    const nodeId = safeString(rawPeer.ID ?? key, 256);
    if (!nodeId || nodeId === selfId) continue;
    const userId = safeString(rawPeer.UserID, 256);
    const user = userId ? users[userId] : undefined;
    const login = safeString(user?.LoginName, 320);
    const peerIps = [...new Set(Array.isArray(rawPeer.TailscaleIPs)
      ? rawPeer.TailscaleIPs.filter((address): address is string => typeof address === "string" && isTailscaleIpv4Address(address))
      : [])].sort();
    const suggestion: TailscalePeerSuggestion = {
      nodeId,
      login,
      os: safeString(rawPeer.OS, 64),
      online: rawPeer.Online === true,
      active: rawPeer.Active === true,
      magicDnsName: normalizeDns(rawPeer.DNSName),
      tailnetIpv4Addresses: peerIps,
    };
    const existing = peersById.get(nodeId);
    if (!existing || Number(suggestion.online) + Number(suggestion.active) > Number(existing.online) + Number(existing.active)) {
      peersById.set(nodeId, suggestion);
    }
  }
  const peers = [...peersById.values()].sort((left, right) =>
    Number(right.online) - Number(left.online)
    || Number(right.active) - Number(left.active)
    || left.nodeId.localeCompare(right.nodeId)
    || (left.login ?? "").localeCompare(right.login ?? ""));
  return peers.length ? { magicDnsName: normalizeMagicDnsName(parsed), tailnetIpv4Addresses, peers } : { magicDnsName: normalizeMagicDnsName(parsed), tailnetIpv4Addresses };
}

export type TailscaleEndpointTransport = "direct" | "serve";

export interface EndpointCandidate {
  readonly transport: TailscaleEndpointTransport;
  readonly kind: "magicdns" | "ipv4";
  readonly host: string;
  readonly url: string;
}

function validatePort(port: number): number {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new RangeError("Port must be between 1 and 65535.");
  return port;
}

function buildWebSocketUrl(protocol: "ws" | "wss", host: string, port: number): string {
  const url = new URL(`${protocol}://${host}`);
  url.port = String(port);
  url.pathname = "/";
  return url.toString();
}

export function buildTailscaleHttpsBaseUrl(input: { readonly magicDnsName: string; readonly servePort?: number }): string {
  const name = input.magicDnsName.trim().replace(/\.+$/u, "");
  if (!name || /[\s/:@]/u.test(name)) throw new TailscaleStatusParseError(new TypeError("Invalid MagicDNS name"));
  const port = validatePort(input.servePort ?? DEFAULT_TAILSCALE_SERVE_PORT);
  const url = new URL(`https://${name}`);
  if (port !== DEFAULT_TAILSCALE_SERVE_PORT) url.port = String(port);
  url.pathname = "/";
  return url.toString();
}

export function buildTailscaleEndpointCandidates(input: {
  readonly status: TailscaleStatus;
  readonly transport?: TailscaleEndpointTransport;
  readonly directPort?: number;
  readonly servePort?: number;
}): readonly EndpointCandidate[] {
  const transport = input.transport ?? "direct";
  const port = validatePort(transport === "direct" ? input.directPort ?? 4879 : input.servePort ?? 8445);
  const candidates: EndpointCandidate[] = [];
  if (input.status.magicDnsName) {
    const name = input.status.magicDnsName.trim().replace(/\.+$/u, "");
    if (!name || /[\s/:@]/u.test(name)) throw new TailscaleStatusParseError(new TypeError("Invalid MagicDNS name"));
    candidates.push({
      transport,
      kind: "magicdns",
      host: name,
      url: buildWebSocketUrl(transport === "direct" ? "ws" : "wss", name, port),
    });
  }
  if (transport === "direct") {
    for (const address of input.status.tailnetIpv4Addresses) {
      if (!isTailscaleIpv4Address(address)) continue;
      candidates.push({ transport, kind: "ipv4", host: address, url: buildWebSocketUrl("ws", address, port) });
    }
  }
  return candidates;
}

export interface TailscaleServeSuggestion {
  readonly executable: string;
  readonly args: readonly string[];
  readonly sideEffect: "manual-only";
}

function isLoopbackHost(host: string): boolean {
  const value = host.trim().toLowerCase().replace(/^\[(.*)\]$/u, "$1");
  return value === "127.0.0.1" || value === "localhost" || value === "::1";
}

export function suggestTailscaleServe(input: { readonly localPort: number; readonly servePort?: number; readonly localHost?: string; readonly executable?: string; readonly mode?: "serve" | "funnel" }): TailscaleServeSuggestion {
  if (input.mode === "funnel") throw new TailscaleServeSuggestionError("Funnel suggestions are not permitted.");
  if (!isLoopbackHost(input.localHost ?? "127.0.0.1")) throw new TailscaleServeSuggestionError("Serve suggestions must target loopback, never 0.0.0.0.");
  const localPort = validatePort(input.localPort);
  const servePort = validatePort(input.servePort ?? DEFAULT_TAILSCALE_SERVE_PORT);
  return { executable: input.executable ?? "tailscale", args: ["serve", "--bg", `--https=${servePort}`, `http://127.0.0.1:${localPort}`], sideEffect: "manual-only" };
}

export interface ReadTailscaleStatusOptions {
  readonly runner: ProcessRunner;
  readonly executable?: string;
  readonly platform?: NodeJS.Platform;
  readonly probe?: PathProbe;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

export async function readTailscaleStatus(input: ReadTailscaleStatusOptions): Promise<TailscaleStatus> {
  const executable = input.executable ?? await discoverTailscaleExecutable({
    ...(input.platform === undefined ? {} : { platform: input.platform }),
    ...(input.probe === undefined ? {} : { probe: input.probe }),
  });
  const args = ["status", "--json"] as const;
  try {
    const result = await runProcess({
      runner: input.runner,
      command: executable,
      args,
      timeoutMs: input.timeoutMs ?? TAILSCALE_STATUS_TIMEOUT_MS,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });
    if (result.stdoutTruncated || result.stderrTruncated) {
      throw new TailscaleCommandError("status", executable, "truncated", {
        stdoutLength: result.stdout.length,
        stderrLength: result.stderr.length,
        stream: result.stdoutTruncated ? "stdout" : "stderr",
      });
    }
    if (result.exitCode !== 0) throw new TailscaleCommandError("status", executable, "exit", { exitCode: result.exitCode, stdoutLength: result.stdout.length, stderrLength: result.stderr.length });
    return parseTailscaleStatus(result.stdout);
  } catch (cause) {
    if (cause instanceof TailscaleStatusParseError) throw cause;
    if (cause instanceof ProcessTimeoutError) throw new TailscaleCommandError("status", executable, "timeout", { timeoutMs: cause.timeoutMs }, cause);
    if (cause instanceof ProcessCancelledError) throw new TailscaleCommandError("status", executable, "cancelled", {}, cause);
    if (cause instanceof ProcessSpawnError) throw new TailscaleCommandError("status", executable, "spawn", {}, cause);
    throw cause;
  }
}
