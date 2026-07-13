import { app } from "electron";
import { DesktopLifecycle } from "./lifecycle.ts";

const lifecycle = new DesktopLifecycle();
void lifecycle.start();

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

process.on("uncaughtException", () => {
  app.quit();
});
process.on("unhandledRejection", () => {
  app.quit();
});
