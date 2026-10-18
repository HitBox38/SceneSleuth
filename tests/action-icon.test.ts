import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { createActionIconController } from "../background/actionIcon.ts";
import { iconThemeRequest } from "../shared/iconProtocol.ts";
import {
  actionIconPaths,
  iconThemes,
  iconSizes,
  sceneEyeSvg,
  sceneEyeElements,
} from "../shared/sceneEye.ts";
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const assetUrl = (path: string) => new URL(path, "moz-extension://example/").href;

test("toolbar icons resolve from the extension root when the worker is inside assets", async () => {
  const root = "chrome-extension://example/";
  const workerUrl = `${root}assets/background.js`;
  const applied: number[] = [];
  const controller = createActionIconController(
    {
      async setIcon({ tabId, path }) {
        for (const size of iconSizes) {
          // Chrome's service-worker binding fetches each path relative to the worker URL.
          const url = new URL(path[size], workerUrl);
          assert.equal(
            url.href,
            `${root}icons/${tabId === 1 ? "godot" : "unity"}/icon-${size}.png`,
          );
          assert.ok(existsSync(`public${url.pathname}`), `Missing packaged icon: ${url.pathname}`);
        }
        applied.push(tabId);
      },
      async setTitle() {},
    },
    (path: string) => new URL(path, root).href,
  );
  await controller.update(1, "godot");
  await controller.update(2, "unity");
  assert.deepEqual(applied, [1, 2]);
});

test("Scene Eye exports share geometry and provide complete static SVG/PNG palettes", () => {
  const shape = (theme: (typeof iconThemes)[number]) =>
    sceneEyeElements(theme).map(({ tag, props }) => ({
      tag,
      props: Object.fromEntries(
        Object.entries(props).filter(([key]) => key !== "fill" && key !== "stroke"),
      ),
    }));
  assert.deepEqual(shape("godot"), shape("unity"));
  assert.deepEqual(shape("github"), shape("godot"));
  for (const theme of iconThemes) {
    assert.equal(readFileSync(`public/icons/scene-eye-${theme}.svg`, "utf8"), sceneEyeSvg(theme));
    for (const size of iconSizes) {
      const png = readFileSync(`public/${actionIconPaths(theme)[size]}`);
      assert.equal(png.readUInt32BE(16), size);
      assert.equal(png.readUInt32BE(20), size);
    }
  }
  assert.notDeepEqual(
    readFileSync("public/icons/unity/icon-32.png"),
    readFileSync("public/icons/godot/icon-32.png"),
  );
});

test("toolbar themes are independent per tab and duplicate updates do not set icons again", async () => {
  const icons: { tabId: number; path: Record<string, string> }[] = [],
    titles: { tabId: number; title: string }[] = [];
  const controller = createActionIconController(
    {
      async setIcon(details) {
        icons.push(details);
      },
      async setTitle(details) {
        titles.push(details);
      },
    },
    assetUrl,
  );
  await Promise.all([controller.update(1, "unity"), controller.update(2, "godot")]);
  await controller.update(1, "unity");
  assert.equal(icons.length, 2);
  assert.equal(
    icons.find((item) => item.tabId === 1)!.path[16],
    assetUrl("icons/unity/icon-16.png"),
  );
  assert.equal(
    icons.find((item) => item.tabId === 2)!.path[16],
    assetUrl("icons/godot/icon-16.png"),
  );
  assert.equal(titles[0].title, "SceneSleuth · Unity review");
  await controller.update(1, "github");
  assert.equal(icons.at(-1)!.path[16], assetUrl("icons/github/icon-16.png"));
  assert.equal(titles.at(-1)!.title, "SceneSleuth");
  controller.remove(1);
  await controller.update(1, "unity");
  assert.equal(icons.length, 4);
});

test("a newer navigation reset wins over an in-flight engine icon", async () => {
  const calls: string[] = [];
  let release: () => void = () => {};
  const first = new Promise<void>((resolve) => {
    release = resolve;
  });
  const controller = createActionIconController(
    {
      async setIcon(details) {
        calls.push(details.path[16]);
        if (calls.length === 1) await first;
      },
      async setTitle() {},
    },
    assetUrl,
  );
  const previous = controller.update(1, "unity");
  await tick();
  const reset = controller.update(1, "github");
  release();
  await Promise.all([previous, reset]);
  assert.deepEqual(calls, [
    assetUrl("icons/unity/icon-16.png"),
    assetUrl("icons/github/icon-16.png"),
  ]);
});

test("closed tabs cancel queued work, and failed updates can be retried", async () => {
  const calls: string[] = [];
  let fail = true;
  const controller = createActionIconController(
    {
      async setIcon(details) {
        calls.push(details.path[16]);
        if (fail) throw new Error("Unavailable");
      },
      async setTitle() {},
    },
    assetUrl,
  );
  await assert.rejects(controller.update(1, "godot"));
  fail = false;
  await controller.update(1, "godot");
  assert.equal(calls.length, 2);
  const pending = controller.update(2, "unity");
  controller.remove(2);
  await pending;
  assert.equal(calls.length, 2);
});

test("only the extension's main-frame GitHub tab can select its current PR icon", () => {
  const sender = {
    id: "extension",
    frameId: 0,
    url: "https://github.com/example/game/pull/1/changes",
    tab: { id: 7 },
  };
  const request = {
    action: "SET_ICON_THEME",
    theme: "unity",
    reviewKey: "/example/game/pull/1:comparison",
  };
  assert.deepEqual(iconThemeRequest(request, sender, "extension"), { tabId: 7, theme: "unity" });
  for (const invalid of [
    { ...sender, id: "other" },
    { ...sender, frameId: 1 },
    { ...sender, tab: undefined },
    { ...sender, url: "https://evil.example/game/pull/1/changes" },
  ])
    assert.equal(iconThemeRequest(request, invalid, "extension"), undefined);
  assert.equal(iconThemeRequest({ ...request, theme: "other" }, sender, "extension"), undefined);
  assert.equal(
    iconThemeRequest({ ...request, theme: { toString: () => "unity" } }, sender, "extension"),
    undefined,
  );
  assert.equal(
    iconThemeRequest({ ...request, reviewKey: "/example/game/pull/2:old" }, sender, "extension"),
    undefined,
  );
  assert.deepEqual(
    iconThemeRequest(request, { ...sender, url: "https://github.com/example/game" }, "extension"),
    { tabId: 7, theme: "github" },
  );
});
