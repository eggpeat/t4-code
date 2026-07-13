export type Platform = "linux" | "macos";
export type ServiceState = "stopped" | "starting" | "running" | "failed" | "unknown";
export type DefinitionState = "missing" | "current" | "drifted";

export interface ServiceSpec {
  readonly profileId: string;
  readonly executable: string;
  readonly argv: readonly string[];
  readonly logsDirectory: string;
  readonly environment?: Readonly<Record<string, string>>;
}

export interface ServiceFileSystem {
  read(path: string): Promise<string | null>;
  writeAtomic(path: string, content: string, mode: number): Promise<void>;
  mkdir(path: string): Promise<void>;
  chmod(path: string, mode: number): Promise<void>;
  remove(path: string): Promise<void>;
  readonly lstat?: (path: string) => Promise<ServiceFileStat | null>;
}

export interface ServiceFileStat {
  readonly mode: number;
  readonly isSymbolicLink: boolean;
}

export interface ServiceRunnerResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export interface ServiceRunner {
  run(argv: readonly string[]): Promise<ServiceRunnerResult>;
}

export interface ServicePlan {
  readonly platform: Platform;
  readonly label: string;
  readonly definitionPath: string;
  readonly content: string;
  readonly mode: 0o600;
  readonly commands: Readonly<{
    install: readonly (readonly string[])[];
    start: readonly (readonly string[])[];
    stop: readonly (readonly string[])[];
    restart: readonly (readonly string[])[];
    uninstall: readonly (readonly string[])[];
    status: readonly (readonly string[])[];
  }>;
}

export interface ServiceInspection {
  readonly definition: DefinitionState;
  readonly service: ServiceState;
  readonly diagnostics: string;
}

export interface RuntimeSnapshot {
  readonly registered: boolean;
  readonly state: ServiceState;
}

export interface ServiceManager {
  inspect(): Promise<ServiceInspection>;
  install(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  restart(): Promise<void>;
  uninstall(): Promise<void>;
}

export class ServiceValidationError extends Error {
  readonly code = "invalid-service-spec" as const;
  constructor(message: string) {
    super(message);
    this.name = "ServiceValidationError";
  }
}

export class ServiceCommandError extends Error {
  readonly code = "service-command-failed" as const;
  readonly command: readonly string[];
  readonly exitCode: number | null;
  constructor(_command: readonly string[], result: ServiceRunnerResult) {
    super(`Service command failed (exit ${String(result.exitCode)}).`);
    this.name = "ServiceCommandError";
    this.command = ["[redacted]"];
    this.exitCode = result.exitCode;
  }
}

export class ServiceFileError extends Error {
  readonly code = "service-file-failed" as const;
  constructor(operation: string, path: string, _cause: unknown) {
    super(`Service file ${operation} failed for ${path}.`);
    this.name = "ServiceFileError";
  }
}
