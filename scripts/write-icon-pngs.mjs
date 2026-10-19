import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
const file = process.argv[2];
if (!file) throw new Error("Usage: node scripts/write-icon-pngs.mjs <exported-bundle.json>");
const bundle = JSON.parse(readFileSync(file, "utf8"));
const themes = ["github", "godot", "unity", "unreal"],
  sizes = [16, 24, 32, 48, 64, 128];
for (const [path, value] of Object.entries(bundle)) {
  const match = /^icons\/(github|godot|unity|unreal)\/icon-(16|24|32|48|64|128)\.png$/.exec(path);
  assert.ok(
    match && themes.includes(match[1]) && sizes.includes(Number(match[2])),
    "Unexpected icon path",
  );
  assert.ok(
    typeof value === "string" &&
      /^data:image\/png;base64,[A-Za-z\d+/=]+$/.test(value) &&
      value.length < 200_000,
    "Invalid PNG export",
  );
  const png = Buffer.from(value.slice("data:image/png;base64,".length), "base64");
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(png.readUInt32BE(16), Number(match[2]));
  assert.equal(png.readUInt32BE(20), Number(match[2]));
  const url = new URL(`../public/${path}`, import.meta.url);
  mkdirSync(new URL(".", url), { recursive: true });
  writeFileSync(url, png);
}
console.log(`Wrote ${Object.keys(bundle).length} PNG exports.`);
