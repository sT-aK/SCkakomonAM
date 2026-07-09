const CACHE = 'kakomon-v10';
const ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './data/index.json',
  './data/sc_r3a_am1.json', './data/sc_r4a_am1.json',
  './data/sc_r5h_am1.json', './data/sc_r6h_am1.json',
  './data/sc_r7a_am1.json'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  // Google API / 認証は常にネットワーク（キャッシュしない）
  if (u.hostname.includes('googleapis.com') || u.hostname.includes('accounts.google.com')) return;
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(resp => {
      const cp = resp.clone();
      caches.open(CACHE).then(c => c.put(e.request, cp));
      return resp;
    }).catch(() => r))
  );
});
