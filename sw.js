const CACHE_NAME = 'flow-motion-engine-v1';
const ASSETS_TO_CACHE = [
    // The Heavy Engine (Cached forever)
    'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.11.0/dist/ffmpeg.min.js',
    'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js',
    'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.11.0/dist/ffmpeg-core.wasm',

    // Static Assets
    '/js/fingerprint.js',
    '/js/utils.js',
    // We DO NOT cache api.js or auth.js to force fresh logic
];

// Install Event - Pre-cache the Engine
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SafeCache] Caching Engine Assets...');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

// Activate Event - Clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// Fetch Event - Network First for HTML/API, Cache First for Engine
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // SECURITY: ALWAYS Network-Only for these critical files
    if (
        url.pathname.endsWith('index.html') ||
        url.pathname.endsWith('login.html') ||
        url.pathname.includes('/api/') ||
        url.pathname.endsWith('.js') // Safer to keep JS fresh for now
    ) {
        return; // Fallback to network
    }

    // Engine & WASM: Cache First (Speed)
    if (
        url.hostname.includes('cdn.jsdelivr.net') ||
        url.pathname.endsWith('.wasm') ||
        url.pathname.endsWith('.css') ||
        url.pathname.endsWith('.woff2')
    ) {
        event.respondWith(
            caches.match(event.request).then((response) => {
                return response || fetch(event.request).then((fetchResponse) => {
                    return caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, fetchResponse.clone());
                        return fetchResponse;
                    });
                });
            })
        );
    }
});
