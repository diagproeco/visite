/* Garde l'appli dans le téléphone pour l'ouvrir sans réseau, et la met à jour quand il y a du réseau */
const CACHE = "visite-hors-reseau-1";
const FICHIERS = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function prevenir() {
  const cs = await self.clients.matchAll({ type: "window" });
  cs.forEach(c => c.postMessage({ type: "maj" }));
}
// Va chercher la dernière version de la page ; si elle a changé, la range et prévient l'appli
async function rafraichirPage(cache) {
  const rep = await fetch("index.html", { cache: "no-store" });
  if (!rep || !rep.ok) return null;
  const ancien = await cache.match("index.html");
  const [a, b] = await Promise.all([ancien ? ancien.text() : null, rep.clone().text()]);
  if (a !== b) {
    await cache.put("index.html", rep.clone());
    await cache.put("./", rep.clone());
    if (a !== null) {
      await new Promise(r => setTimeout(r, 2000)); // laisse à la page le temps de s'ouvrir avant de la prévenir
      await prevenir();
    }
  }
  return rep;
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (req.mode === "navigate") {
      // La page : celle du téléphone tout de suite, la nouvelle version cherchée en arrière-plan
      const enCache = await cache.match("index.html");
      const reseau = rafraichirPage(cache).catch(() => null);
      if (enCache) { e.waitUntil(reseau); return enCache; }
      const rep = await reseau;
      return rep || new Response("Pas de réseau : ouvre l'appli une première fois avec du réseau.",
        { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
    const enCache = await cache.match(req, { ignoreSearch: true });
    const reseau = fetch(req).then(rep => { if (rep && rep.ok) cache.put(req, rep.clone()); return rep; }).catch(() => null);
    if (enCache) { e.waitUntil(reseau); return enCache; }
    return (await reseau) || new Response("", { status: 504 });
  })());
});
