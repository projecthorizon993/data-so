/* AURA service worker — v4: cache DRAINED on purpose.
   The app needs the network for chat anyway, and stale caches caused users
   to run old code with old error messages. This SW deletes every cache on
   activate and never stores again (pass-through fetch). */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", () => { /* pass-through: no caching */ });
