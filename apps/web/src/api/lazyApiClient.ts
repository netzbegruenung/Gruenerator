/**
 * Lazy API Client Loader
 *
 * Defers loading of the API client and @gruenerator/shared dependencies
 * until after React has mounted, reducing initial bundle size.
 *
 * Previously, apiClient was imported as a side-effect in index.tsx,
 * which pulled in the entire @gruenerator/shared/api bundle (~800 KB-1.2 MB)
 * before the app could render.
 */

let apiClientInitialized = false;
let initializationPromise: Promise<void> | null = null;

/**
 * Initialize the API client on demand
 * Safe to call multiple times - will only initialize once
 */
export async function initializeApiClient(): Promise<void> {
  if (apiClientInitialized) {
    return;
  }

  // If initialization is already in progress, return the existing promise
  if (initializationPromise) {
    return initializationPromise;
  }

  // Start initialization
  initializationPromise = (async () => {
    try {
      // Dynamic import defers loading until this function is called
      await import('../components/utils/apiClient');
      apiClientInitialized = true;
      console.log('[API] API client initialized');
    } catch (error) {
      console.error('[API] Failed to initialize API client:', error);
      // Reset so it can be retried
      initializationPromise = null;
      throw error;
    }
  })();

  return initializationPromise;
}

/**
 * Check if API client is ready without initializing it
 */
export function isApiClientReady(): boolean {
  return apiClientInitialized;
}

/**
 * Reset initialization state (for testing)
 */
export function resetApiClient(): void {
  apiClientInitialized = false;
  initializationPromise = null;
}
