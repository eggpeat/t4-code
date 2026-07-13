// Dev-only screenshot harness for SettingsWorkspace. Served by the Vite dev
// server at /src/features/settings/dev/harness.html; never part of the app
// bundle. Query parameters pin deterministic states for visual proof:
//   ?theme=dark        dark theme
//   ?rm=1              forced reduced motion
//   ?text=200          200% text scaling
//   ?section=<id>      active section
//   ?scope=<scope>     edit layer (global | project | session)
//   ?q=<query>         search query
//   ?state=dirty       staged edits including one invalid draft
//   ?state=conflict    dirty plus an external revision conflict
//   ?state=restart     a saved restart-required change
//   ?accent=<preset>   pinned accent preset (default: persisted or Pi Pink)
import "../../../app.css";

import { TooltipProvider } from "@t4-code/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { applyAccent, loadAccent, parseAccent } from "../../../theme/accent.ts";
import { createFixtureSettingsController, SETTINGS_CATALOG_FIXTURE, SETTINGS_CATALOG_REVISED_FIXTURE } from "../fixtures.ts";
import { createSettingsStore } from "../settings-store.ts";
import { SettingsWorkspace } from "../SettingsWorkspace.tsx";

const params = new URLSearchParams(window.location.search);

if (params.get("theme") === "dark") document.documentElement.classList.add("dark");
if (params.get("rm") === "1") document.documentElement.classList.add("force-reduced-motion");
if (params.get("text") === "200") document.documentElement.style.fontSize = "200%";

const accentParam = params.get("accent");
applyAccent(accentParam === null ? loadAccent() : parseAccent(accentParam));

const store = createSettingsStore(SETTINGS_CATALOG_FIXTURE, createFixtureSettingsController());

const section = params.get("section");
if (section !== null) store.getState().setActiveSection(section);
const scope = params.get("scope");
if (scope === "global" || scope === "project" || scope === "session") {
  store.getState().setEditScope(scope);
}
const query = params.get("q");
if (query !== null) store.getState().setQuery(query);

const state = params.get("state");
if (state === "dirty" || state === "conflict") {
  store.getState().stageValue("appearance.theme", "light");
  store.getState().stageValue("notifications.sound", true);
  store.getState().stageValue("terminal.scrollback", 5);
}
if (state === "conflict") {
  store.getState().ingestCatalog(SETTINGS_CATALOG_REVISED_FIXTURE);
}
if (state === "restart") {
  store.getState().stageValue("terminal.scrollback", 20000);
  void store.getState().save();
}

const rootElement = document.getElementById("root");
if (rootElement === null) throw new Error("Missing #root element");
rootElement.style.height = "100vh";

createRoot(rootElement).render(
  <StrictMode>
    <TooltipProvider>
      <SettingsWorkspace api={store} />
    </TooltipProvider>
  </StrictMode>,
);
