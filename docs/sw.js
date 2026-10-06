/* Offline cache. The page itself is network-first, so a new deploy shows up on the next visit; the
   cache is the offline fallback. Icons and the manifest are cache-first and refresh in the background. */
const VERSION = "f100caa004";
const CACHE = "almanac-" + VERSION;
const ASSETS = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png", "icon-maskable-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // fonts etc. go straight to the network
  if (e.request.mode === "navigate") {
    e.respondWith(caches.open(CACHE).then(c => fetch(e.request)
      .then(r => { if (r.ok) c.put("index.html", r.clone()); return r; })
      .catch(async () => (await c.match("index.html")) || c.match("./"))));
    return;
  }
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
