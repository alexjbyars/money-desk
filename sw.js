// Money Desk offline support: keeps a copy of the app's own files on the phone.
// It never sends or receives your data; your entries stay in the app's storage.
const VERSION = "money-desk-v2";
const FILES = [
  "./", "index.html", "parse.js", "manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png",
  "ocr/tesseract.min.js", "ocr/worker.min.js",
  "ocr/core/tesseract-core-lstm.wasm.js", "ocr/core/tesseract-core-simd-lstm.wasm.js",
  "ocr/lang/eng.traineddata.gz"
];
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
    return res;
  })));
});
