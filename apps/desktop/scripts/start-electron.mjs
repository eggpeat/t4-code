import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const electron = process.env.ELECTRON_BIN ?? require("electron");
const cwd = join(import.meta.dirname, "..");
const child = spawn(electron, [join(cwd, "dist-electron", "main.cjs")], {
  cwd,
  env: { ...process.env, ELECTRON_RUN_AS_NODE: "0" },
  stdio: "inherit",
  shell: false,
});
child.on("exit", (code, signal) => {
  if (signal !== null) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
