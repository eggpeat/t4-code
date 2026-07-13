// Pure logic behind the Model roles and Task agents editors. Everything here
// operates on the same host-published setting values the generic rows edit —
// `modelRoles` (record of role → model selector), `cycleOrder` (array of role
// ids), `task.agentModelOverrides` (record of agent → selector chain), and
// `task.disabledAgents` (array of agent names). No second store: these
// helpers parse, validate, and rebuild those values; staging still goes
// through the settings store's drafts and the host's CAS revision.
import type { SettingValue } from "./schema.ts";
import type { SettingLayerScope } from "./schema.ts";
import { readScope, type SettingRow, valueAtScope } from "./view-model.ts";
import type { SettingDraft } from "./settings-store.ts";

// ─── Roles ──────────────────────────────────────────────────────────────────

export interface BuiltinRole {
  readonly id: string;
  /** Mono chip text, e.g. DEFAULT. */
  readonly tag: string;
  /** Human name, e.g. "Fast". */
  readonly name: string;
}

/** OMP's built-in roles, in the order the terminal's model hub lists them. */
export const BUILTIN_ROLES: readonly BuiltinRole[] = [
  { id: "default", tag: "DEFAULT", name: "Default" },
  { id: "smol", tag: "SMOL", name: "Fast" },
  { id: "slow", tag: "SLOW", name: "Thinking" },
  { id: "vision", tag: "VISION", name: "Vision" },
  { id: "plan", tag: "PLAN", name: "Architect" },
  { id: "designer", tag: "DESIGNER", name: "Designer" },
  { id: "commit", tag: "COMMIT", name: "Commit" },
  { id: "tiny", tag: "TINY", name: "Tiny" },
  { id: "task", tag: "TASK", name: "Subtask" },
  { id: "advisor", tag: "ADVISOR", name: "Advisor" },
] as const;

/** Roles shown expanded by default; the rest sit behind "Show all roles". */
export const PRIMARY_ROLE_IDS: readonly string[] = ["default", "smol", "slow", "task"];

const BUILTIN_BY_ID: Readonly<Record<string, BuiltinRole>> = Object.fromEntries(
  BUILTIN_ROLES.map((role) => [role.id, role]),
);

export function roleInfo(id: string): BuiltinRole {
  return BUILTIN_BY_ID[id] ?? { id, tag: id.toUpperCase().slice(0, 12), name: id };
}

export function isBuiltinRole(id: string): boolean {
  return BUILTIN_BY_ID[id] !== undefined;
}

/**
 * Canonical role list for the editor: built-ins first, then custom roles the
 * configuration introduces through the cycle order or a model assignment.
 * Mirrors OMP's getKnownRoleIds without importing engine code.
 */
export function knownRoleIds(
  modelRoles: Readonly<Record<string, string>>,
  cycleOrder: readonly string[],
): readonly string[] {
  const roles: string[] = BUILTIN_ROLES.map((role) => role.id);
  const seen = new Set(roles);
  const add = (role: string) => {
    if (role.length === 0 || seen.has(role)) return;
    seen.add(role);
    roles.push(role);
  };
  for (const role of cycleOrder) add(role);
  for (const role of Object.keys(modelRoles)) add(role);
  return roles;
}

/** What an unset role resolves to, per OMP's resolver. Copy, not behavior. */
export function roleFallbackNote(id: string): string {
  switch (id) {
    case "smol":
    case "slow":
    case "designer":
      return "Follows Default, then built-in picks.";
    case "advisor":
      return "Follows the Thinking chain.";
    case "tiny":
      return "Follows Fast.";
    default:
      return "Built-in picks.";
  }
}

/** When an edit to this role takes effect. No role edit needs a restart. */
export function roleEffectNote(id: string): string {
  if (id === "default") {
    return "Applies to new sessions and explicit switches. Running sessions keep their model until you switch them.";
  }
  if (id === "advisor") return "Applies to advisors immediately.";
  return "Applies from the next use.";
}

// ─── Model selectors ────────────────────────────────────────────────────────

/** OMP's thinking-effort ladder as it appears in `:level` selector suffixes. */
export const THINKING_LEVELS = ["minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

const THINKING_LOOKUP: Readonly<Record<string, true>> = { minimal: true, low: true, medium: true, high: true, xhigh: true, max: true };

export interface ParsedSelector {
  /** Selector without a thinking suffix, e.g. `xai-oauth/grok-4.5`. */
  readonly base: string;
  readonly thinking: ThinkingLevel | null;
}

/** Split a `provider/id[:level]` selector; only real levels are stripped. */
export function parseSelector(selector: string): ParsedSelector {
  const at = selector.lastIndexOf(":");
  if (at > 0) {
    const suffix = selector.slice(at + 1);
    if (THINKING_LOOKUP[suffix] === true) {
      return { base: selector.slice(0, at), thinking: suffix as ThinkingLevel };
    }
  }
  return { base: selector, thinking: null };
}

export function withThinking(base: string, thinking: ThinkingLevel | null): string {
  return thinking === null ? base : `${base}:${thinking}`;
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting them is the point
const CONTROL_CHARS = /\p{Cc}/u;
const MAX_SELECTOR = 256;

/**
 * Hard validation for a typed model selector. Returns a human message or
 * null. Soft concerns (not in the catalog, wildcards) are advisories — the
 * host is the final authority and legitimately accepts selectors this app
 * cannot verify.
 */
export function validateSelector(selector: string): string | null {
  if (selector.trim().length === 0) return "Enter a model selector.";
  if (selector.length > MAX_SELECTOR) return `Keep it under ${MAX_SELECTOR} characters.`;
  if (CONTROL_CHARS.test(selector)) return "Contains characters that can't be saved.";
  if (/\s/.test(selector)) return "Selectors can't contain spaces.";
  if (!selector.includes("/")) return "Use provider/model-id, or a pi/<role> alias.";
  return null;
}

/** Non-blocking advisory for a selector; null when there is nothing to say. */
export function selectorAdvisory(
  selector: string,
  roleId: string | null,
  catalogSelectors: ReadonlySet<string>,
): string | null {
  const { base } = parseSelector(selector);
  if (roleId !== null && base === `pi/${roleId}`) {
    return "Points at itself — OMP will use built-in picks.";
  }
  if (base.startsWith("pi/")) return null;
  if (base.includes("*")) return null;
  if (catalogSelectors.size > 0 && !catalogSelectors.has(base)) {
    return "Not in this host's catalog — kept as written.";
  }
  return null;
}

// ─── Override chains ────────────────────────────────────────────────────────

/**
 * A task-agent override may be an ordered comma-separated fallback chain
 * (`"google/gemini-3-pro,openai/gpt-5.5"`). Parse to an ordered list; empty
 * entries drop out.
 */
export function parseChain(value: string): readonly string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/** Serialize a chain back into the single string setting the host stores. */
export function serializeChain(entries: readonly string[]): string {
  return entries.join(",");
}

// ─── List editing ───────────────────────────────────────────────────────────

/** Move `list[index]` by `delta` positions; out-of-range moves return `list`. */
export function moveItem<T>(list: readonly T[], index: number, delta: number): readonly T[] {
  const target = index + delta;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item as T);
  return next;
}

// ─── Reading values through drafts ──────────────────────────────────────────

/**
 * The value an editor should show for a row at a scope, with the staged
 * draft overlaid — the same resolution SettingRowView renders.
 */
export function draftedValue(
  row: SettingRow,
  scope: Exclude<SettingLayerScope, "cli">,
  draft: SettingDraft | undefined,
): SettingValue | undefined {
  if (draft === undefined) return valueAtScope(row, scope);
  if (draft.action === "set") return draft.value;
  const reading = readScope(row, scope);
  if (reading.fallbackSource === "default") return row.defaultValue;
  if (reading.fallbackSource !== null) return row.layers[reading.fallbackSource]?.value;
  return row.defaultValue;
}

function isStringRecord(value: SettingValue): value is Readonly<Record<string, string>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A record-valued row's current record, or null when the shape is off. */
export function recordValue(value: SettingValue | undefined): Readonly<Record<string, string>> | null {
  if (value === undefined) return {};
  return isStringRecord(value) ? value : null;
}

/** A list-valued row's current list, or null when the shape is off. */
export function listValue(value: SettingValue | undefined): readonly string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  return value;
}
