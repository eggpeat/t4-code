import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

// Re-renders the committed desktop icon rasters from their SVG masters:
// - apps/desktop/build/icon.png            1024 master (mac + fallback)
// - apps/desktop/build/icons/NxN.png       Linux icon set
// 16 and 32 come from dedicated pixel-hinted masters (icon-16.svg /
// icon-32.svg); every other size renders from icon.svg at native
// resolution — never a PNG downscale. Run only after editing a master.
export const LINUX_ICON_SIZES = [16, 32, 48, 64, 128, 256, 512, 1024];
export const HINTED_SIZES = new Set([16, 32]);

function renderPng(source, output, size) {
  const result = spawnSync(
    "inkscape",
    ["--export-type=png", `--export-width=${size}`, `--export-height=${size}`, `--export-filename=${output}`, source],
    { stdio: "inherit" },
  );
  if (result.error) {
    throw new Error(`inkscape is required to re-render the desktop icon: ${result.error.message}`);
  }
  if (result.status !== 0) throw new Error(`inkscape exited with status ${result.status}`);
}

export function renderDesktopIcon(repoRoot = resolve(import.meta.dirname, "..")) {
  const buildDir = join(repoRoot, "apps", "desktop", "build");
  const iconsDir = join(buildDir, "icons");
  const master = join(buildDir, "icon.svg");
  if (!existsSync(master)) throw new Error(`icon source missing: ${master}`);
  mkdirSync(iconsDir, { recursive: true });

  const outputs = [];
  renderPng(master, join(buildDir, "icon.png"), 1024);
  outputs.push(join(buildDir, "icon.png"));
  for (const size of LINUX_ICON_SIZES) {
    const source = HINTED_SIZES.has(size) ? join(buildDir, `icon-${size}.svg`) : master;
    if (!existsSync(source)) throw new Error(`icon source missing: ${source}`);
    const output = join(iconsDir, `${size}x${size}.png`);
    renderPng(source, output, size);
    outputs.push(output);
  }
  return outputs;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  try {
    for (const output of renderDesktopIcon()) console.log(`rendered ${output}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
