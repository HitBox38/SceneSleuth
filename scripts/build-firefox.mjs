import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const source = new URL("../dist/", import.meta.url);
const destination = new URL("../dist-firefox/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", source), "utf8"));

// Reuse the exact same bundles and assets with Firefox's event-page manifest.
// Keep Chrome's unpacked installation in dist/ untouched.
manifest.background = { scripts: [manifest.background.service_worker] };
delete manifest.minimum_chrome_version;
manifest.browser_specific_settings = {
  gecko: {
    id: "scenesleuth@hitbox38",
    strict_min_version: "140.0",
    data_collection_permissions: { required: ["none"] },
  },
  gecko_android: { strict_min_version: "142.0" },
};
rmSync(destination, { recursive: true, force: true });
cpSync(source, destination, { recursive: true });
writeFileSync(new URL("manifest.json", destination), JSON.stringify(manifest, null, 2) + "\n");
console.log("Firefox extension written to dist-firefox/.");
