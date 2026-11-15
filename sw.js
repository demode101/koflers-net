/* koflers.net – Service Worker (App-Modus / offline)
 * Seiten: erst Netz, bei Funkloch aus dem Cache.
 * CSS/JS/Bilder: sofort aus dem Cache, im Hintergrund aktualisieren.
 * Fremde Adressen (z. B. Spotify-Worker) werden nie zwischengespeichert.
 * Bei jeder Änderung an der Seite VERSION hochzählen. */
var VERSION = "km-v2";
var CORE = [
  "/", "/index.html", "/3d-druck.html", "/plotten.html", "/home-assistant.html",
  "/musik.html", "/ueber.html", "/impressum.html", "/datenschutz.html", "/404.html",
  "/assets/css/style.css", "/assets/js/main.js", "/assets/favicon.svg",
  "/assets/icons/icon-192.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(CORE); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then(function (res) {
      var copy = res.clone();
      caches.open(VERSION).then(function (c) { c.put(req, copy); });
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (hit) { return hit || caches.match("/index.html"); });
    }));
    return;
  }

  e.respondWith(caches.match(req).then(function (hit) {
    var net = fetch(req).then(function (res) {
      if (res.ok) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); }
      return res;
    }).catch(function () { return hit; });
    return hit || net;
  }));
});
