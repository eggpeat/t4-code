import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { inflateSync } from "node:zlib";

// Brand contract for the desktop icon masters and rendered rasters:
// - apps/desktop/build/icon.svg + icon-16.svg + icon-32.svg (vector masters)
// - apps/desktop/build/icon.png (1024 master, mac)
// - apps/desktop/build/icons/NxN.png (Linux icon set)
// Pi Pink is the only identity accent; the chassis is neutral near-black;
// every raster keeps a >=12% transparent safe margin outside the rounded
// contour (macOS masking at 1024, consistent policy at every size).
const PI_PINK = { r: 0xe8, g: 0x31, b: 0x74 };
const LEGACY_HEXES = ["#f97316", "#ff6b35", "#ff8c00", "#e8590c"];
export const LINUX_ICON_SIZES = [16, 32, 48, 64, 128, 256, 512, 1024];
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error("not a PNG file");
  let offset = 8;
  let header = null;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12],
      };
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  if (!header) throw new Error("PNG has no IHDR chunk");
  if (header.bitDepth !== 8 || header.colorType !== 6 || header.interlace !== 0) {
    throw new Error(
      `PNG must be 8-bit non-interlaced RGBA (bitDepth=${header.bitDepth}, colorType=${header.colorType}, interlace=${header.interlace})`,
    );
  }
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = header.width * bpp;
  const pixels = Buffer.allocUnsafe(header.height * stride);
  for (let y = 0; y < header.height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = y * stride;
    const prev = out - stride;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= bpp ? pixels[out + x - bpp] : 0;
      const up = y > 0 ? pixels[prev + x] : 0;
      const upLeft = y > 0 && x >= bpp ? pixels[prev + x - bpp] : 0;
      let value = row[x];
      switch (filter) {
        case 0:
          break;
        case 1:
          value += left;
          break;
        case 2:
          value += up;
          break;
        case 3:
          value += (left + up) >> 1;
          break;
        case 4: {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          value += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
          break;
        }
        default:
          throw new Error(`unsupported PNG filter ${filter} on row ${y}`);
      }
      pixels[out + x] = value & 0xff;
    }
  }
  return { width: header.width, height: header.height, pixels };
}

function pixelAt(image, x, y) {
  const index = (y * image.width + x) * 4;
  return {
    r: image.pixels[index],
    g: image.pixels[index + 1],
    b: image.pixels[index + 2],
    a: image.pixels[index + 3],
  };
}

function isLegacyOrange({ r, g, b, a }) {
  // Orange band (old accent family); Pi Pink (b=116) and neutrals fall outside.
  return a > 200 && r > 190 && g > 70 && g < 150 && b < 70;
}

function isPiPink({ r, g, b, a }) {
  return (
    a > 200 &&
    Math.abs(r - PI_PINK.r) <= 12 &&
    Math.abs(g - PI_PINK.g) <= 12 &&
    Math.abs(b - PI_PINK.b) <= 12
  );
}

function checkSvgMaster(path, label, errors) {
  if (!existsSync(path)) {
    errors.push(`missing icon source: ${label}`);
    return;
  }
  const svg = readFileSync(path, "utf8");
  if (!/#e83174/iu.test(svg)) errors.push(`${label} lost the Pi Pink accent (#e83174)`);
  if (/<(?:linearGradient|radialGradient|filter|text|image)\b/iu.test(svg)) errors.push(`${label} must stay flat vector: no gradients, filters, text, or embedded images`);
  for (const legacy of LEGACY_HEXES) {
    if (svg.toLowerCase().includes(legacy)) errors.push(`${label} contains legacy accent ${legacy}`);
  }
}

function checkRaster(path, label, size, errors) {
  if (!existsSync(path)) {
    errors.push(`missing rendered icon: ${label} (run node scripts/render-desktop-icon.mjs)`);
    return;
  }
  let image;
  try {
    image = decodePng(readFileSync(path));
  } catch (error) {
    errors.push(`${label} unreadable: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  if (image.width !== size || image.height !== size) {
    errors.push(`${label} must be ${size}x${size}, got ${image.width}x${image.height}`);
    return;
  }

  // >=12% safe margin: the outer ring must be fully transparent.
  const safeMargin = Math.floor(size * 0.12);
  let ringOpaque = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const edge = Math.min(x, y, size - 1 - x, size - 1 - y);
      if (edge < safeMargin && pixelAt(image, x, y).a !== 0) ringOpaque += 1;
    }
  }
  if (ringOpaque > 0) {
    errors.push(`${label} violates the ${safeMargin}px (12%) transparent safe margin: ${ringOpaque} opaque ring pixels`);
  }

  const center = pixelAt(image, size / 2, size / 2);
  if (center.a !== 255) errors.push(`${label} center must be fully opaque (chassis missing)`);

  const chassis = pixelAt(image, Math.floor(size * 0.2), size / 2);
  const spread = Math.max(chassis.r, chassis.g, chassis.b) - Math.min(chassis.r, chassis.g, chassis.b);
  if (chassis.a !== 255 || spread > 12 || Math.max(chassis.r, chassis.g, chassis.b) > 88) {
    errors.push(`${label} chassis must be neutral near-black`);
  }

  const step = size >= 256 ? 4 : 1;
  let pinkFound = false;
  let orangeFound = 0;
  for (let y = 0; y < size; y += step) {
    for (let x = 0; x < size; x += step) {
      const pixel = pixelAt(image, x, y);
      if (!pinkFound && isPiPink(pixel)) pinkFound = true;
      if (isLegacyOrange(pixel)) orangeFound += 1;
    }
  }
  if (!pinkFound) errors.push(`${label} is missing the Pi Pink accent — likely a default/placeholder icon`);
  if (orangeFound > 0) errors.push(`${label} contains ${orangeFound} sampled legacy-orange pixels`);
}

export function verifyDesktopIcon(repoRoot = resolve(import.meta.dirname, "..")) {
  const errors = [];
  const buildDir = join(repoRoot, "apps", "desktop", "build");

  checkSvgMaster(join(buildDir, "icon.svg"), "icon.svg", errors);
  checkSvgMaster(join(buildDir, "icon-16.svg"), "icon-16.svg", errors);
  checkSvgMaster(join(buildDir, "icon-32.svg"), "icon-32.svg", errors);

  checkRaster(join(buildDir, "icon.png"), "icon.png", 1024, errors);
  for (const size of LINUX_ICON_SIZES) {
    checkRaster(join(buildDir, "icons", `${size}x${size}.png`), `icons/${size}x${size}.png`, size, errors);
  }

  return { errors, buildDir };
}
