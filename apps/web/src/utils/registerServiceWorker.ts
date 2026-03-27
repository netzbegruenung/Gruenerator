/**
 * Service Worker Registration Utility
 *
 * Registers the illustration cache service worker and provides
 * utilities for controlling and monitoring the cache.
 */

export interface ServiceWorkerStatus {
  registered: boolean;
  cacheSize?: number;
  cacheName?: string;
}

/**
 * Register the illustration cache service worker
 * Only in production mode to avoid conflicts during development
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  // Only register in production and if Service Worker is supported
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw-illustration-cache.js', {
      scope: '/',
    });

    // Handle updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // New Service Worker available, notify user
          // Show a notification to the user — reload happens via controllerchange
          if (window.confirm('Eine neue Version ist verfügbar. Möchtest du aktualisieren?')) {
            newWorker.postMessage({ type: 'SKIP_WAITING' });
          }
        }
      });
    });

    // Handle controller change (new Service Worker activated)
    let isReloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (isReloading) return;
      isReloading = true;
      window.location.reload();
    });

    return registration;
  } catch (error) {
    console.error('[SW] Service Worker registration failed:', error);
    return null;
  }
}

/**
 * Unregister the service worker (useful for debugging)
 */
export async function unregisterServiceWorker(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const unregistered = await registration.unregister();
    return unregistered;
  } catch (error) {
    console.error('[SW] Unregistration failed:', error);
    return false;
  }
}

/**
 * Clear the illustration cache
 */
export async function clearIllustrationCache(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    if (!registration.active) {
      return false;
    }

    const activeWorker = registration.active;
    return new Promise<boolean>((resolve) => {
      const messageChannel = new MessageChannel();

      messageChannel.port1.onmessage = (event) => {
        resolve(event.data.success === true);
      };

      activeWorker.postMessage({ type: 'CLEAR_CACHE' }, [messageChannel.port2]);

      // Timeout after 5 seconds
      setTimeout(() => resolve(false), 5000);
    });
  } catch (error) {
    console.error('[SW] Failed to clear cache:', error);
    return false;
  }
}

/**
 * Get the current cache size
 */
export async function getCacheSize(): Promise<ServiceWorkerStatus> {
  if (!('serviceWorker' in navigator)) {
    return { registered: false };
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    if (!registration.active) {
      return { registered: false };
    }

    const activeWorker = registration.active;
    return new Promise<ServiceWorkerStatus>((resolve) => {
      const messageChannel = new MessageChannel();

      messageChannel.port1.onmessage = (event) => {
        resolve({
          registered: true,
          cacheSize: event.data.size,
          cacheName: event.data.cacheName,
        });
      };

      activeWorker.postMessage({ type: 'GET_CACHE_SIZE' }, [messageChannel.port2]);

      // Timeout after 5 seconds
      setTimeout(() => resolve({ registered: true }), 5000);
    });
  } catch (error) {
    console.error('[SW] Failed to get cache size:', error);
    return { registered: false };
  }
}

/**
 * Check if Service Worker is registered and active
 */
export async function isServiceWorkerActive(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    return !!(registration && registration.active);
  } catch (error) {
    console.error('[SW] Failed to check Service Worker status:', error);
    return false;
  }
}
