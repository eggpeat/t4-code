// Redacted diagnostics export. Everything a support thread needs — ids,
// where each value comes from, validation state — with every sensitive
// value withheld at the source. Secret rows never had values in the view
// model; this pass additionally strips values from anything marked
// sensitive, so the export is safe to paste anywhere.
import type { SettingLayerScope, SettingValue } from "./schema.ts";
import { SETTING_LAYER_SCOPES } from "./schema.ts";
import type { SettingRow, SettingsViewModel } from "./view-model.ts";

export interface DiagnosticsSettingEntry {
  readonly id: string;
  readonly section: string;
  readonly control: string;
  readonly effectiveSource: string | null;
  /** Present only when the setting is safe to include verbatim. */
  readonly effectiveValue?: SettingValue;
  readonly redacted: boolean;
  readonly layersPresent: readonly SettingLayerScope[];
  readonly secretStatus?: string;
  readonly secretReference?: string;
  readonly secretSource?: string;
  readonly restartRequired?: true;
  readonly invalid?: string;
  readonly unavailable?: string;
}

export interface DiagnosticsExport {
  readonly kind: "t4-code.settings-diagnostics";
  readonly revision: string;
  readonly hostId: string;
  readonly generatedAt: string;
  readonly settings: readonly DiagnosticsSettingEntry[];
}

function entryForRow(row: SettingRow): DiagnosticsSettingEntry {
  const redacted = row.sensitive;
  const layersPresent = SETTING_LAYER_SCOPES.filter(
    (scope) => row.layers[scope] !== undefined,
  );
  return {
    id: row.id,
    section: row.sectionId,
    control: row.control.kind === "unsupported" ? `unsupported(${row.control.declaredKind})` : row.control.kind,
    effectiveSource: row.effective?.source ?? null,
    ...(row.effective !== undefined && !redacted ? { effectiveValue: row.effective.value } : {}),
    redacted,
    layersPresent,
    ...(row.control.kind === "secret"
      ? {
          secretStatus: row.control.status.state,
          secretReference: row.control.status.reference,
          secretSource: row.control.status.source,
        }
      : {}),
    ...(row.restartRequired ? { restartRequired: true as const } : {}),
    ...(row.invalidMessage !== null ? { invalid: row.invalidMessage } : {}),
    ...(row.unavailableReason !== null ? { unavailable: row.unavailableReason } : {}),
  };
}

function collectRows(rows: readonly SettingRow[]): DiagnosticsSettingEntry[] {
  const entries: DiagnosticsSettingEntry[] = [];
  for (const row of rows) {
    entries.push(entryForRow(row));
    if (row.control.kind === "nested") entries.push(...collectRows(row.control.children));
  }
  return entries;
}

export function buildDiagnosticsExport(
  viewModel: SettingsViewModel,
  generatedAt: string,
): DiagnosticsExport {
  return {
    kind: "t4-code.settings-diagnostics",
    revision: viewModel.revision,
    hostId: viewModel.hostId,
    generatedAt,
    settings: viewModel.sections.flatMap((section) => collectRows(section.rows)),
  };
}
