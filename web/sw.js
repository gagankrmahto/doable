/* Doable service worker — network-first with offline fallback. */
const CACHE = 'doable-v19';
const ASSETS = [
  './', './index.html', './styles.css', './app.js', './nlp.js', './sync.js', './config.js', './build.js', './update.js', './panchang.js', './ics.js', './freelance.js', './issues.js', './timelog.js', './sharing.js', './planner.js', './assistant.js',
  './data/festivals.js', './data/calendars.js', './data/cities.js',
  './vendor/firebase.js', './vendor/capacitor.js', './manifest.webmanifest', './icon.svg',
  './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(cs => (cs.length ? cs[0].focus() : self.clients.openWindow('./')))
  );
});
