import { builtinModules } from "node:module";
import { defineConfig } from "vite-plus";

const external = new Set([
  "electron",
  "electron-store",
  "electron-updater",
  "ws",
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]);

export default defineConfig({
  build: {
    outDir: "dist-electron",
    emptyOutDir: false,
    lib: { entry: "src/preload.ts", formats: ["cjs"] },
    rollupOptions: {
      external: (id) => external.has(id) || id.startsWith("node:"),
      output: { entryFileNames: "preload.cjs", codeSplitting: false },
    },
  },
});
