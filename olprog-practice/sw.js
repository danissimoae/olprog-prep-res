// Свои файлы (сайт, задачи, индекс): сначала сеть, кэш только если офлайн.
// Так новые задачи видны сразу, а офлайн всё продолжает работать.
// Библиотеки с CDN (версии зафиксированы в URL): сначала кэш.
const CACHE = 'olprog-v2';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
            .then(() => clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    const isOwnFile = new URL(event.request.url).origin === location.origin;
    event.respondWith(isOwnFile ? networkFirst(event.request) : cacheFirst(event.request));
});

async function networkFirst(request) {
    const cache = await caches.open(CACHE);
    try {
        const response = await fetch(request.url, { cache: 'no-cache' });
        if (response.ok) cache.put(request, response.clone());
        return response;
    } catch (error) {
        const cached = await cache.match(request);
        if (cached) return cached;
        throw error;
    }
}

async function cacheFirst(request) {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
    return response;
}