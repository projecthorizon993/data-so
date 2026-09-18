const CACHE = "nim-chat-v2";
const SHELL = ["./","./index.html","./assets/styles.css","./assets/app.js","./assets/score.js","./assets/export.js","./config.json","./chat.template.json","./items.json","./manifest.webmanifest"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.pathname.startsWith("/api/")) return; // never cache API streams
  e.respondWith((async () => {
    const hit = await caches.match(e.request);
    const net = fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(cc => cc.put(e.request, c)); } return r; }).catch(() => hit);
    return hit || net;
  })());
});
