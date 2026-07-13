// Web entry. Importing the store instance applies the persisted theme at
// module scope — before the first render — so there is no theme flash.
import "./app.css";
import "./state/store-instance.ts";

import { TooltipProvider } from "@t4-code/ui";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { router } from "./router.tsx";

const rootElement = document.getElementById("root");
if (rootElement === null) throw new Error("Missing #root element");

createRoot(rootElement).render(
  <StrictMode>
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>
  </StrictMode>,
);
