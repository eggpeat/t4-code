// Entry for the dev-only onboarding scene harness. Theme and motion variants
// come from query params so screenshot capture is deterministic:
//   ?scene=host-menu&theme=dark&motion=reduced
import "../../../app.css";

import { TooltipProvider } from "@t4-code/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { GALLERY_SCENES, type GalleryScene, OnboardingGallery } from "./OnboardingGallery.tsx";

const params = new URLSearchParams(window.location.search);
const requested = params.get("scene") ?? "flow-runtime-missing";
const scene: GalleryScene = (GALLERY_SCENES as readonly string[]).includes(requested)
  ? (requested as GalleryScene)
  : "flow-runtime-missing";

document.documentElement.classList.toggle("dark", params.get("theme") === "dark");

const rootElement = document.getElementById("root");
if (rootElement === null) throw new Error("Missing #root element");
rootElement.className = "flex h-full min-h-0 flex-col overflow-y-auto bg-background";
if (params.get("motion") === "reduced") rootElement.classList.add("force-reduced-motion");

createRoot(rootElement).render(
  <StrictMode>
    <TooltipProvider>
      <OnboardingGallery scene={scene} />
    </TooltipProvider>
  </StrictMode>,
);
