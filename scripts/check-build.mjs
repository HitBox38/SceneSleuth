import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";

function checkBuild(directory) {
  const dist = new URL(directory, import.meta.url);
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
  for (const path of Object.values(manifest.action.default_icon ?? {})) asset(path);
  for (const path of new Set(
    [...(manifest.background?.scripts ?? []), manifest.background?.service_worker].filter(Boolean),
  )) {
    new Script(readFileSync(asset(path), "utf8"), { filename: path });
  }
  for (const theme of ["github", "godot", "unity", "unreal"]) {
    asset(`icons/scene-eye-${theme}.svg`);
    for (const size of [16, 24, 32, 48, 64, 128]) {
      const png = readFileSync(asset(`icons/${theme}/icon-${size}.png`));
      assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
      assert.equal(png.readUInt32BE(16), size);
      assert.equal(png.readUInt32BE(20), size);
    }
  }

  for (const entry of manifest.content_scripts ?? []) {
    for (const path of entry.js ?? []) {
      const url = asset(path);
      // Manifest content scripts must parse as classic scripts, without ESM imports/exports.
      new Script(readFileSync(url, "utf8"), { filename: fileURLToPath(url) });
    }
    for (const path of entry.css ?? []) asset(path);
  }
  return manifest;
}

const chrome = checkBuild("../dist/");
const firefox = checkBuild("../dist-firefox/");
assert.equal(chrome.background.scripts, undefined);
assert.equal(typeof chrome.background.service_worker, "string");
assert.equal(firefox.background.service_worker, undefined);
assert.deepEqual(firefox.background.scripts, [chrome.background.service_worker]);
assert.equal(firefox.minimum_chrome_version, undefined);
assert.equal(firefox.browser_specific_settings.gecko.id, "scenesleuth@hitbox38");
assert.equal(firefox.browser_specific_settings.gecko.strict_min_version, "140.0");
assert.equal(firefox.browser_specific_settings.gecko_android.strict_min_version, "142.0");
assert.deepEqual(firefox.browser_specific_settings.gecko.data_collection_permissions, {
  required: ["none"],
});
// Browser packaging must not change capabilities, matches, popup or asset paths.
const sharedFirefox = {
  ...firefox,
  background: chrome.background,
  minimum_chrome_version: chrome.minimum_chrome_version,
};
delete sharedFirefox.browser_specific_settings;
assert.deepEqual(sharedFirefox, chrome);
console.log("Chrome and Firefox manifests, packaged assets and classic scripts verified.");
