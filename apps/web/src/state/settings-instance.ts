// The browser-showcase settings store. Fixture catalog and fixture write
// seam, created lazily and only ever reached from browser mode — the desktop
// settings surface builds its own live store from runtime frames and never
// touches this module's fixtures. A singleton so leaving and re-entering
// Settings preserves scroll section, drafts, and staged state.
import {
  createFixtureSettingsController,
  SETTINGS_CATALOG_FIXTURE,
} from "../features/settings/fixtures.ts";
import { createSettingsStore, type SettingsStoreApi } from "../features/settings/settings-store.ts";

let instance: SettingsStoreApi | null = null;

export function fixtureSettingsStore(): SettingsStoreApi {
  if (instance === null) {
    instance = createSettingsStore(SETTINGS_CATALOG_FIXTURE, createFixtureSettingsController());
  }
  return instance;
}
