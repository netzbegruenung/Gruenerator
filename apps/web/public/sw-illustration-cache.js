/**
 * Service Worker for Illustration Caching
 *
 * Provides persistent cross-session caching for SVG illustrations with:
 * - Precaching of top 50 popular illustrations
 * - Stale-while-revalidate strategy for all illustration requests
 * - Browser-managed 100MB storage
 * - Automatic cache versioning and cleanup
 */

const CACHE_VERSION = 'v1';
const CACHE_NAME = `gruenerator-illustrations-${CACHE_VERSION}`;

// Top 50 most popular illustrations to precache on install
// These are the most frequently used illustrations across all canvas types
const TOP_ILLUSTRATIONS = [
    '/illustrations/undraw/voting_3ygx.svg',
    '/illustrations/undraw/team_spirit_dwxw.svg',
    '/illustrations/undraw/election_day_w842.svg',
    '/illustrations/undraw/people_search_wctu.svg',
    '/illustrations/undraw/community_8nwl.svg',
    '/illustrations/undraw/environment_iaus.svg',
    '/illustrations/undraw/tree_swing_y2n1.svg',
    '/illustrations/undraw/happy_announcement_ac67.svg',
    '/illustrations/undraw/conversation_h12g.svg',
    '/illustrations/undraw/speech_to_text_9uir.svg',
    '/illustrations/undraw/nature_on_screen_xkli.svg',
    '/illustrations/undraw/electric_car_b7hl.svg',
    '/illustrations/undraw/wind_turbine_x2k4.svg',
    '/illustrations/undraw/solar_panel_ibwx.svg',
    '/illustrations/undraw/bike_ride_7xit.svg',
    '/illustrations/undraw/education_f8ru.svg',
    '/illustrations/undraw/project_team_lc5a.svg',
    '/illustrations/undraw/celebration_0jvk.svg',
    '/illustrations/undraw/voice_assistant_nrv7.svg',
    '/illustrations/undraw/mobile_user_7oqo.svg',
    '/illustrations/undraw/social_share_j1ke.svg',
    '/illustrations/undraw/business_plan_5i9d.svg',
    '/illustrations/undraw/agreement_aajr.svg',
    '/illustrations/undraw/handshake_6ea5.svg',
    '/illustrations/undraw/collaboration_0lxp.svg',
    '/illustrations/opendoodles/sitting-8.svg',
    '/illustrations/opendoodles/standing-2.svg',
    '/illustrations/opendoodles/standing-18.svg',
    '/illustrations/opendoodles/walking-9.svg',
    '/illustrations/opendoodles/reading-book.svg',
    '/illustrations/opendoodles/skateboarding.svg',
    '/illustrations/opendoodles/coffee.svg',
    '/illustrations/opendoodles/selfie.svg',
    '/illustrations/opendoodles/plant.svg',
    '/illustrations/opendoodles/dog-sitting.svg',
    '/illustrations/opendoodles/cat-laying.svg',
    '/illustrations/opendoodles/flower.svg',
    '/illustrations/opendoodles/cactus.svg',
    '/illustrations/opendoodles/sprout.svg',
    '/illustrations/opendoodles/coffee-and-donut.svg',
    '/illustrations/opendoodles/book.svg',
    '/illustrations/opendoodles/laptop.svg',
    '/illustrations/opendoodles/bicycle.svg',
    '/illustrations/opendoodles/sunglasses.svg',
    '/illustrations/opendoodles/plant-in-pot.svg',
    '/illustrations/opendoodles/mug.svg',
    '/illustrations/opendoodles/music.svg',
    '/illustrations/opendoodles/camera.svg',
    '/illustrations/opendoodles/speech-bubble.svg',
    '/illustrations/opendoodles/star.svg',
];

// =============================================================================
// INSTALL EVENT - Precache popular illustrations
// =============================================================================

self.addEventListener('install', (event) => {
    console.log('[SW] Installing illustration cache service worker...');

    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('[SW] Precaching top 50 illustrations...');
            // Use addAll with { mode: 'no-cors' } to handle potential CORS issues
            return cache.addAll(TOP_ILLUSTRATIONS.map(url => new Request(url, { mode: 'no-cors' })))
                .then(() => {
                    console.log('[SW] Precaching complete!');
                })
                .catch(err => {
                    console.warn('[SW] Some illustrations failed to precache:', err);
                    // Continue anyway - missing illustrations will be fetched on demand
                });
        })
    );

    // Force immediate activation
    self.skipWaiting();
});

// =============================================================================
// ACTIVATE EVENT - Cleanup old caches
// =============================================================================

self.addEventListener('activate', (event) => {
    console.log('[SW] Activating illustration cache service worker...');

    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames
                    .filter(name => name.startsWith('gruenerator-illustrations-') && name !== CACHE_NAME)
                    .map(name => {
                        console.log('[SW] Deleting old cache:', name);
                        return caches.delete(name);
                    })
            );
        }).then(() => {
            console.log('[SW] Old caches cleaned up!');
        })
    );

    // Take control of all clients immediately
    self.clients.claim();
});

// =============================================================================
// FETCH EVENT - Stale-while-revalidate strategy
// =============================================================================

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Only intercept illustration requests
    if (!url.pathname.startsWith('/illustrations/')) {
        return;
    }

    // Ignore illustration requests with color query parameters (handled by in-memory cache)
    if (url.searchParams.has('color')) {
        return;
    }

    event.respondWith(
        caches.open(CACHE_NAME).then(cache => {
            return cache.match(event.request).then(cachedResponse => {
                // Fetch from network in background
                const fetchPromise = fetch(event.request)
                    .then(networkResponse => {
                        // Only cache successful responses
                        if (networkResponse && networkResponse.status === 200) {
                            // Clone the response before caching (response can only be consumed once)
                            cache.put(event.request, networkResponse.clone());
                        }
                        return networkResponse;
                    })
                    .catch(err => {
                        console.warn('[SW] Network fetch failed, using cache:', err);
                        return cachedResponse; // Fallback to cached if network fails
                    });

                // Return cached immediately if available, otherwise wait for network
                return cachedResponse || fetchPromise;
            });
        })
    );
});

// =============================================================================
// MESSAGE EVENT - Control commands from main thread
// =============================================================================

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }

    if (event.data && event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.delete(CACHE_NAME).then(() => {
                console.log('[SW] Cache cleared!');
                event.ports[0].postMessage({ success: true });
            })
        );
    }

    if (event.data && event.data.type === 'GET_CACHE_SIZE') {
        event.waitUntil(
            caches.open(CACHE_NAME).then(cache => {
                return cache.keys().then(keys => {
                    event.ports[0].postMessage({
                        size: keys.length,
                        cacheName: CACHE_NAME
                    });
                });
            })
        );
    }
});

console.log('[SW] Illustration cache service worker loaded!');
