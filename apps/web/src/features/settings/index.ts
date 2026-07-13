// Settings feature surface. Integration contract: mount <SettingsWorkspace>
// with a store from createSettingsStore(catalog, controller). The catalog is
// host-published schema metadata (settings.metadata feature); the controller
// is the settings.write seam. Fixtures cover every control kind and state.
export {
  applyChangesToCatalog,
  createFixtureSettingsController,
  SETTINGS_CATALOG_FIXTURE,
  SETTINGS_CATALOG_REVISED_FIXTURE,
} from "./fixtures.ts";
export type {
  EditableScope,
  SettingLayerScope,
  SettingsCatalogMetadata,
  SettingsController,
  SettingsSaveRequest,
  SettingsSaveResult,
  SettingValue,
} from "./schema.ts";
export {
  createSettingsStore,
  type SettingsStoreApi,
  useSettings,
} from "./settings-store.ts";
export { SettingsWorkspace } from "./SettingsWorkspace.tsx";
export {
  buildSettingsViewModel,
  SettingsMetadataError,
  type SettingsViewModel,
} from "./view-model.ts";
