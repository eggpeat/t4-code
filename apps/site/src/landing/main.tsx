import "../site.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Landing } from "./Landing.tsx";

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");
createRoot(root).render(
  <StrictMode>
    <Landing />
  </StrictMode>,
);
