/**
 * Run once to generate PWA icons from icon.svg
 * Usage: node scripts/generate-icons.mjs
 *
 * Requires: npm install -D sharp
 * Or run: npx sharp-cli --input public/icon.svg --output public/icon-192.png --resize 192
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const svgBuffer = readFileSync(join(root, "public/icon.svg"));

await sharp(svgBuffer).resize(192, 192).png().toFile(join(root, "public/icon-192.png"));
console.log("icon-192.png generated");

await sharp(svgBuffer).resize(512, 512).png().toFile(join(root, "public/icon-512.png"));
console.log("icon-512.png generated");
