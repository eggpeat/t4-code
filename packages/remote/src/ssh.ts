import { ProcessCancelledError, ProcessSpawnError, ProcessTimeoutError, runProcess, type ProcessRunner } from "./process.ts";

export interface SshTarget {
  readonly alias: string;
  readonly hostname: string;
  readonly username: string | null;
  readonly port: number | null;
}

export interface SshCommandResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

export class SshInvalidTargetError extends Error {
  readonly tag = "SshInvalidTargetError" as const;
  constructor(message: string) {
    super(message);
    this.name = "SshInvalidTargetError";
  }
}

export class SshCommandError extends Error {
  readonly tag: string = "SshCommandError";
  readonly command: readonly string[];
  readonly exitCode: number | null;
  readonly stderr: string;
  readonly stdout: string | undefined;
  constructor(message: string, command: readonly string[], exitCode: number | null, stderr: string, stdout?: string, cause?: unknown) {
    super(message, { cause });
    this.name = "SshCommandError";
    this.command = command;
    this.exitCode = exitCode;
    this.stderr = stderr;
    this.stdout = stdout;
  }
}

export class SshCommandTimeoutError extends SshCommandError {
  override readonly tag = "SshCommandTimeoutError" as const;
  readonly timeoutMs: number;
  constructor(timeoutMs: number, command: readonly string[], cause?: unknown) {
    super(`SSH command timed out after ${timeoutMs}ms.`, command, null, "", undefined, cause);
    this.name = "SshCommandTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export class SshReadinessError extends Error {
  readonly tag = "SshReadinessError" as const;
  readonly diagnostics: { readonly url: string; readonly timeoutMs: number; readonly lastFailure?: string };
  constructor(message: string, diagnostics: { readonly url: string; readonly timeoutMs: number; readonly lastFailure?: string }, cause?: unknown) {
    super(message, { cause });
    this.name = "SshReadinessError";
    this.diagnostics = diagnostics;
  }
}

export interface SshAuthOptions {
  readonly authSecret?: string | null;
  readonly batchMode?: "yes" | "no";
  readonly interactiveAuth?: boolean;
  readonly identityFile?: string;
}

export type SshAuthMethod = "batch" | "interactive" | "askpass" | "identity-file";
export function decideSshAuthMethod(input: SshAuthOptions = {}): SshAuthMethod {
  if (input.identityFile?.trim()) return "identity-file";
  if (input.authSecret !== undefined && input.authSecret !== null) return "askpass";
  if (input.interactiveAuth) return "interactive";
  return "batch";
}

export function parseSshResolveOutput(alias: string, stdout: string): SshTarget {
  const values = new Map<string, string>();
  for (const line of stdout.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [key, ...rest] = trimmed.split(/\s+/u);
    if (key && rest.length && !values.has(key)) values.set(key, rest.join(" ").trim());
  }
  const hostname = values.get("hostname") || alias;
  const username = values.get("user") || null;
  const port = Number.parseInt(values.get("port") ?? "", 10);
  return { alias, hostname, username, port: Number.isInteger(port) && port > 0 && port <= 65535 ? port : null };
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

function validateSshTargetPart(name: string, value: string, allowEmpty = false): string {
  const trimmed = value.trim();
  if (!trimmed && allowEmpty) return "";
  if (!trimmed || trimmed.startsWith("-") || /[\s]/u.test(trimmed) || hasControlCharacter(trimmed)) {
    throw new SshInvalidTargetError(`SSH ${name} is invalid.`);
  }
  return trimmed;
}

export function buildSshHostSpec(target: SshTarget): string {
  const alias = validateSshTargetPart("alias", target.alias, true);
  const hostname = validateSshTargetPart("hostname", target.hostname, true);
  const destination = alias || hostname;
  if (!destination) throw new SshInvalidTargetError("SSH target is missing its alias/hostname.");
  const username = target.username === null ? null : validateSshTargetPart("username", target.username);
  return username ? `${username}@${destination}` : destination;
}

export function baseSshArgs(target: SshTarget, input: { readonly batchMode?: "yes" | "no" } = {}): string[] {
  const args = ["-o", `BatchMode=${input.batchMode ?? "yes"}`, "-o", "ConnectTimeout=10"];
  if (target.port !== null) args.push("-p", String(target.port));
  return args;
}

export interface SshArgv {
  readonly command: string;
  readonly args: readonly string[];
}

export function buildSshArgv(target: SshTarget, input: { readonly platform?: NodeJS.Platform; readonly preHostArgs?: readonly string[]; readonly remoteCommandArgs?: readonly string[]; readonly batchMode?: "yes" | "no"; readonly identityFile?: string } = {}): SshArgv {
  const host = buildSshHostSpec(target);
  const command = input.platform === "win32" ? "ssh.exe" : "ssh";
  const args = [...baseSshArgs(target, input.batchMode === undefined ? {} : { batchMode: input.batchMode }), ...(input.identityFile ? ["-i", input.identityFile] : []), ...(input.preHostArgs ?? []), host, ...(input.remoteCommandArgs ?? [])];
  return { command, args };
}

export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function buildSshShellCommand(argv: SshArgv): string {
  return [argv.command, ...argv.args].map(shellQuote).join(" ");
}

export function getLastNonEmptyOutputLine(stdout: string): string | null {
  const lines = stdout.trim().split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  return lines.at(-1) ?? null;
}

const SECRET_PATTERN = /((?:["']?(?:access[_-]?token|bearer(?:token)?|credential|pairing[_-]?token|auth[_-]?secret|token)["']?)\s*[:=]\s*)(["']?)[^\s,"'}]+/giu;
export function redactSshOutput(output: string): string {
  const redacted = output.replace(SECRET_PATTERN, "$1$2[redacted]");
  return redacted.length > 4_000 ? `${redacted.slice(0, 4_000)}\n[truncated]` : redacted;
}

function redactArg(value: string): string {
  SECRET_PATTERN.lastIndex = 0;
  return SECRET_PATTERN.test(value) ? "[redacted]" : value;
}
function safeCommand(argv: SshArgv): readonly string[] {
  return [argv.command, ...argv.args].map(redactArg);
}
export function buildSshChildEnvironment(input: { readonly baseEnv?: NodeJS.ProcessEnv; readonly interactiveAuth?: boolean; readonly authSecret?: string | null; readonly askpassPath?: string; readonly platform?: NodeJS.Platform }): NodeJS.ProcessEnv {
  const env = { ...(input.baseEnv ?? process.env) };
  if (!input.interactiveAuth && input.authSecret === undefined) return env;
  if (input.askpassPath) {
    env.SSH_ASKPASS = input.askpassPath;
    env.SSH_ASKPASS_REQUIRE = "force";
  }
  if (input.authSecret !== undefined) env.OMP_SSH_AUTH_SECRET = input.authSecret ?? "";
  if (input.interactiveAuth && input.platform !== "win32" && !env.DISPLAY) env.DISPLAY = "t3code";
  return env;
}

export function isSshAuthFailure(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return /permission denied \((?:publickey|password|keyboard-interactive|hostbased|gssapi-with-mic)[^)]*\)|authentication failed|too many authentication failures/iu.test(text);
}

export async function runSshCommand(input: { readonly target: SshTarget; readonly runner: ProcessRunner; readonly platform?: NodeJS.Platform; readonly preHostArgs?: readonly string[]; readonly remoteCommandArgs?: readonly string[]; readonly stdin?: string; readonly timeoutMs?: number; readonly signal?: AbortSignal; readonly auth?: SshAuthOptions; readonly env?: NodeJS.ProcessEnv }): Promise<SshCommandResult> {
  const argv = buildSshArgv(input.target, {
    ...(input.platform === undefined ? {} : { platform: input.platform }),
    ...(input.preHostArgs === undefined ? {} : { preHostArgs: input.preHostArgs }),
    ...(input.remoteCommandArgs === undefined ? {} : { remoteCommandArgs: input.remoteCommandArgs }),
    batchMode: input.auth?.batchMode ?? (input.auth?.interactiveAuth ? "no" : "yes"),
    ...(input.auth?.identityFile === undefined ? {} : { identityFile: input.auth.identityFile }),
  });
  try {
    const result = await runProcess({
      runner: input.runner,
      command: argv.command,
      args: argv.args,
      ...(input.stdin === undefined ? {} : { stdin: input.stdin }),
      env: buildSshChildEnvironment({
        ...(input.env === undefined ? {} : { baseEnv: input.env }),
        ...input.auth,
        ...(input.platform === undefined ? {} : { platform: input.platform }),
      }),
      timeoutMs: input.timeoutMs ?? 60_000,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });
    const stderr = redactSshOutput(result.stderr);
    const stdout = redactSshOutput(result.stdout);
    if (result.exitCode !== 0) {
      const message = (stderr.trim() || stdout.trim() || `SSH command failed (exit ${result.exitCode}).`).trim();
      throw new SshCommandError(message, safeCommand(argv), result.exitCode, stderr, stdout);
    }
    return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode ?? 0 };
  } catch (cause) {
    if (cause instanceof SshCommandError) throw cause;
    if (cause instanceof ProcessTimeoutError) throw new SshCommandTimeoutError(cause.timeoutMs, safeCommand(argv), cause);
    if (cause instanceof ProcessCancelledError) throw new SshCommandError("SSH command was cancelled.", safeCommand(argv), null, "", undefined, cause);
    if (cause instanceof ProcessSpawnError) throw new SshCommandError("Failed to start SSH command.", safeCommand(argv), null, "", undefined, cause);
    throw cause;
  }
}
