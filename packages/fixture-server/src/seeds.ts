import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { AppWireError, decodeClientFrame } from "@t4-code/protocol";
import { FIXTURE_SEED_SCHEMA } from "./schema.ts";

export const SCENARIO_IDS = [
  "basic-v1",
  "stream-v1",
  "hierarchy-v1",
  "history-10k-v1",
  "faults-v1",
  "multi-client-v1",
  "remote-v1",
  "a11y-v1",
  "reconnect-v1",
  "preview-v1",
] as const;
export type ScenarioId = (typeof SCENARIO_IDS)[number];
export type ReplayMode = "none" | "same-epoch" | "gap-snapshot";
export interface PromptStep {
  atMs: number;
  kind: "entry" | "event";
  text?: string;
}
export interface FaultSeed {
  id: string;
  frame: unknown;
  expectedError: string;
}
export interface ScenarioSeed {
  schemaVersion: 1;
  id: ScenarioId;
  description?: string;
  epoch: string;
  baseTime: string;
  revision: string;
  hostId: string;
  sessionId: string;
  projectId: string;
  historyMessages?: number;
  historyParts?: number;
  clients?: number;
  accessibility?: boolean;
  scripts: { prompt: PromptStep[]; replay: ReplayMode };
  faults: FaultSeed[];
  expectedHash: string;
}

const seedUrls: Record<ScenarioId, URL> = {
  "basic-v1": new URL("./seeds/basic-v1.json", import.meta.url),
  "stream-v1": new URL("./seeds/stream-v1.json", import.meta.url),
  "hierarchy-v1": new URL("./seeds/hierarchy-v1.json", import.meta.url),
  "history-10k-v1": new URL("./seeds/history-10k-v1.json", import.meta.url),
  "faults-v1": new URL("./seeds/faults-v1.json", import.meta.url),
  "multi-client-v1": new URL("./seeds/multi-client-v1.json", import.meta.url),
  "remote-v1": new URL("./seeds/remote-v1.json", import.meta.url),
  "a11y-v1": new URL("./seeds/a11y-v1.json", import.meta.url),
  "reconnect-v1": new URL("./seeds/reconnect-v1.json", import.meta.url),
  "preview-v1": new URL("./seeds/preview-v1.json", import.meta.url),
};

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function failSeed(id: string, message: string): never {
  throw new Error(`invalid fixture seed ${id}: ${message}`);
}
function boundedString(value: unknown, name: string, min: number, max: number, id: string): string {
  if (typeof value !== "string") failSeed(id, `${name} must be a string of length ${min}..${max}`);
  const length = Array.from(value).length;
  if (length < min || length > max)
    failSeed(id, `${name} must be a string of length ${min}..${max}`);
  return value;
}
function integer(value: unknown, name: string, min: number, max: number, id: string): number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max)
    failSeed(id, `${name} must be an integer in ${min}..${max}`);
  return value as number;
}
function noExtras(
  value: Record<string, unknown>,
  allowed: readonly string[],
  id: string,
  where: string,
): void {
  for (const key of Object.keys(value))
    if (!allowed.includes(key)) failSeed(id, `${where} has additional property ${key}`);
}
function dateTime(value: unknown, id: string): string {
  const result = boundedString(value, "baseTime", 1, Number.MAX_SAFE_INTEGER, id);
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/u.exec(result);
  if (match === null) failSeed(id, "baseTime must be an RFC3339 date-time");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offset =
    match[7] === "Z"
      ? null
      : { hour: Number(match[7]!.slice(1, 3)), minute: Number(match[7]!.slice(4, 6)) };
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth =
    [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth ||
    hour > 23 ||
    minute > 59 ||
    second > 60 ||
    (offset !== null && (offset.hour > 23 || offset.minute > 59))
  )
    failSeed(id, "baseTime must be an RFC3339 date-time");
  return result;
}
function jsonValue(value: unknown, id: string, where: string): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (Number.isFinite(value)) return;
    failSeed(id, `${where} must be JSON`);
  }
  if (Array.isArray(value)) {
    for (const item of value) jsonValue(item, id, where);
    return;
  }
  if (isObject(value)) {
    for (const item of Object.values(value)) jsonValue(item, id, where);
    return;
  }
  failSeed(id, `${where} must be JSON`);
}

/** Validate exactly the constraints in schema/fixture-seed.schema.json without coercion. */
export function validateSeedSchema(value: unknown, expectedId?: ScenarioId): void {
  if (!isObject(value)) failSeed(expectedId ?? "unknown", "must be an object");
  const id = typeof value.id === "string" ? value.id : (expectedId ?? "unknown");
  noExtras(
    value,
    [
      "schemaVersion",
      "id",
      "description",
      "epoch",
      "baseTime",
      "revision",
      "hostId",
      "sessionId",
      "projectId",
      "historyMessages",
      "historyParts",
      "scripts",
      "faults",
      "clients",
      "accessibility",
      "expectedHash",
    ],
    id,
    "seed",
  );
  for (const key of [
    "schemaVersion",
    "id",
    "epoch",
    "baseTime",
    "revision",
    "hostId",
    "sessionId",
    "projectId",
    "scripts",
    "faults",
    "expectedHash",
  ])
    if (!(key in value)) failSeed(id, `missing required property ${key}`);
  if (value.schemaVersion !== 1) failSeed(id, "schemaVersion must equal 1");
  if (!SCENARIO_IDS.includes(value.id as ScenarioId)) failSeed(id, "id is not a known scenario");
  if (expectedId !== undefined && value.id !== expectedId)
    failSeed(id, `id must equal ${expectedId}`);
  if (value.description !== undefined) boundedString(value.description, "description", 0, 256, id);
  boundedString(value.epoch, "epoch", 1, 128, id);
  dateTime(value.baseTime, id);
  for (const key of ["revision", "hostId", "sessionId", "projectId"])
    boundedString(value[key], key, 1, 128, id);
  if (value.historyMessages !== undefined)
    integer(value.historyMessages, "historyMessages", 0, 10000, id);
  if (value.historyParts !== undefined) integer(value.historyParts, "historyParts", 0, 30000, id);
  if (value.clients !== undefined) integer(value.clients, "clients", 1, 8, id);
  if (value.accessibility !== undefined && typeof value.accessibility !== "boolean")
    failSeed(id, "accessibility must be boolean");
  if (typeof value.expectedHash !== "string" || !/^[0-9a-f]{64}$/u.test(value.expectedHash))
    failSeed(id, "expectedHash must be 64 lowercase hex characters");
  if (!isObject(value.scripts)) failSeed(id, "scripts must be an object");
  noExtras(value.scripts, ["prompt", "replay"], id, "scripts");
  if (!("prompt" in value.scripts) || !("replay" in value.scripts))
    failSeed(id, "scripts requires prompt and replay");
  if (!Array.isArray(value.scripts.prompt)) failSeed(id, "scripts.prompt must be an array");
  if (!["none", "same-epoch", "gap-snapshot"].includes(value.scripts.replay as string))
    failSeed(id, "scripts.replay is invalid");
  value.scripts.prompt.forEach((raw, index) => {
    if (!isObject(raw)) failSeed(id, `scripts.prompt[${index}] must be an object`);
    noExtras(raw, ["atMs", "kind", "text"], id, `scripts.prompt[${index}]`);
    if (!("atMs" in raw) || !("kind" in raw))
      failSeed(id, `scripts.prompt[${index}] missing required property`);
    integer(raw.atMs, `scripts.prompt[${index}].atMs`, 0, 3_600_000, id);
    if (raw.kind !== "entry" && raw.kind !== "event")
      failSeed(id, `scripts.prompt[${index}].kind is invalid`);
    if (raw.text !== undefined)
      boundedString(raw.text, `scripts.prompt[${index}].text`, 0, 4096, id);
  });
  if (!Array.isArray(value.faults)) failSeed(id, "faults must be an array");
  value.faults.forEach((raw, index) => {
    if (!isObject(raw)) failSeed(id, `faults[${index}] must be an object`);
    noExtras(raw, ["id", "frame", "expectedError"], id, `faults[${index}]`);
    for (const key of ["id", "frame", "expectedError"])
      if (!(key in raw)) failSeed(id, `faults[${index}] missing required property ${key}`);
    jsonValue(raw.frame, id, `faults[${index}].frame`);
    boundedString(raw.id, `faults[${index}].id`, 1, 128, id);
    boundedString(raw.expectedError, `faults[${index}].expectedError`, 1, 256, id);
  });
}

function parseSeed(value: unknown, expectedId: ScenarioId): ScenarioSeed {
  validateSeedSchema(value, expectedId);
  const raw = value as Record<string, unknown>;
  const scripts = raw.scripts as Record<string, unknown>;
  const prompt = (scripts.prompt as Array<Record<string, unknown>>).map((step) => ({
    atMs: step.atMs as number,
    kind: step.kind as "entry" | "event",
    ...(step.text === undefined ? {} : { text: step.text as string }),
  }));
  const seed: ScenarioSeed = {
    schemaVersion: 1,
    id: expectedId,
    ...(raw.description === undefined ? {} : { description: raw.description as string }),
    epoch: raw.epoch as string,
    baseTime: raw.baseTime as string,
    revision: raw.revision as string,
    hostId: raw.hostId as string,
    sessionId: raw.sessionId as string,
    projectId: raw.projectId as string,
    ...(raw.historyMessages === undefined
      ? {}
      : { historyMessages: raw.historyMessages as number }),
    ...(raw.historyParts === undefined ? {} : { historyParts: raw.historyParts as number }),
    ...(raw.clients === undefined ? {} : { clients: raw.clients as number }),
    ...(raw.accessibility === undefined ? {} : { accessibility: raw.accessibility as boolean }),
    scripts: { prompt, replay: scripts.replay as ReplayMode },
    faults: (raw.faults as Array<Record<string, unknown>>).map((fault) => ({
      id: fault.id as string,
      frame: fault.frame,
      expectedError: fault.expectedError as string,
    })),
    expectedHash: raw.expectedHash as string,
  };
  return seed;
}

/** Deterministic JSON: object keys sort lexicographically; arrays retain order. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new TypeError("canonical JSON does not support non-finite numbers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
      .join(",")}}`;
  }
  throw new TypeError("canonical JSON does not support undefined or functions");
}
export function canonicalSha256(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}
export function hashSeed(seed: ScenarioSeed): string {
  const { expectedHash: _expectedHash, ...withoutHash } = seed;
  return canonicalSha256(withoutHash);
}

/** Execute a committed expected-invalid decoder fixture and assert its exact protocol error. */
export function executeFault(fault: FaultSeed): { code: string; message: string } {
  try {
    decodeClientFrame(fault.frame);
    throw new Error(`fault ${fault.id} unexpectedly decoded`);
  } catch (error) {
    if (!(error instanceof AppWireError)) throw error;
    if (error.code !== fault.expectedError)
      throw new Error(`fault ${fault.id} expected ${fault.expectedError}, got ${error.code}`);
    return { code: error.code, message: error.message };
  }
}

export function loadScenario(id: ScenarioId): ScenarioSeed {
  const seed = parseSeed(JSON.parse(readFileSync(seedUrls[id], "utf8")) as unknown, id);
  const hash = hashSeed(seed);
  if (seed.expectedHash !== undefined && seed.expectedHash !== hash)
    throw new Error(`seed hash mismatch for ${id}`);
  for (const fault of seed.faults) executeFault(fault);
  return seed;
}
export function loadAllScenarios(): readonly ScenarioSeed[] {
  return SCENARIO_IDS.map(loadScenario);
}
export { FIXTURE_SEED_SCHEMA };
