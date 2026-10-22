/* بيت الوقاية - Service Worker */
const CACHE_NAME = 'baytwikaya-v6';
const PRECACHE_URLS = [
    './',
    'faq',
    'prices',
    'app',
    'sunnah',
    'calories',
    'water',
    'baytwikaya-logo.png',
    'manifest.json',
    'icon-192.png',
    'icon-512.png',
    'service-hijama.jpg',
    'service-bones.jpg',
    'service-massage.jpg'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(PRECACHE_URLS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') {
        return;
    }
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) {
        return;
    }
    event.respondWith(
        caches.match(request).then((cached) => {
            if (cached) {
                return cached;
            }
            return fetch(request)
                .then((response) => {
                    const copy = response.clone();
                    caches.open(CACHE_NAME)
                        .then((cache) => cache.put(request, copy))
                        .catch(() => {});
                    return response;
                })
                .catch(() => caches.match('./'));
        })
    );
});
