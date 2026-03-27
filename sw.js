const CACHE_NAME = "Rapaces-V6";

const urlsToCache = [
  "/fiche-rapaces/",
  "/fiche-rapaces/index.html",
  "/fiche-rapaces/tableau-nourrissage.html",
  "/fiche-rapaces/icon.png",
  "/fiche-rapaces/manifest.json"
];

const CACHE_NAME = "Rapaces-V6";

const urlsToCache = [
  "/fiche-rapaces/",
  "/fiche-rapaces/index.html",
  "/fiche-rapaces/tableau-nourrissage.html",
  "/fiche-rapaces/icon.png",
  "/fiche-rapaces/manifest.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => response || fetch(event.request))
  );
});
