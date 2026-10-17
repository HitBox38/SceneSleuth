// Only the localhost development fixture registers this worker. Synthetic
// example/game image requests never reach GitHub; production uses real images.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const match = url.pathname.match(
    /^\/example\/game\/raw\/([ab]{40})\/Assets\/(light|missing)\.png$/,
  );
  if (url.origin !== "https://github.com" || !match || event.request.destination !== "image")
    return;
  if (match[2] === "missing") {
    event.respondWith(new Response("Missing synthetic image", { status: 404 }));
    return;
  }
  const version = match[1][0] === "a" ? "before" : "after";
  event.respondWith(fetch(new URL(`./fixtures/preview-${version}.svg`, self.location.href)));
});
