import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";

const dist = new URL("../dist/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", dist), "utf8"));

function asset(path) {
  const url = new URL(path.replace(/^\//, ""), dist);
  assert.ok(url.href.startsWith(dist.href), `Asset escapes dist/: ${path}`);
  assert.ok(statSync(url).isFile(), `Missing built asset: ${path}`);
  return url;
}

const popup = readFileSync(asset(manifest.action.default_popup), "utf8");
for (const [, path] of popup.matchAll(/(?:src|href)="([^"#]+)"/g)) {
  if (/^(?:https?:|data:)/.test(path)) continue;
  const url = path.startsWith("/")
    ? path
    : new URL(path, new URL(manifest.action.default_popup, dist)).href.slice(dist.href.length);
  asset(url);
}

for (const path of Object.values(manifest.icons ?? {})) asset(path);
for (const path of manifest.background?.scripts ?? []) asset(path);
if (manifest.background?.service_worker) asset(manifest.background.service_worker);

for (const entry of manifest.content_scripts ?? []) {
  for (const path of entry.js ?? []) {
    const url = asset(path);
    // Manifest content scripts must parse as classic scripts, without ESM imports/exports.
    new Script(readFileSync(url, "utf8"), { filename: fileURLToPath(url) });
  }
  for (const path of entry.css ?? []) asset(path);
}

console.log("Built extension assets exist; manifest content scripts parse as classic JavaScript.");
