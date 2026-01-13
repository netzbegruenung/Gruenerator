/**
 * Lazy i18n Loader
 *
 * Defers loading of i18next and translation files until after React has mounted,
 * reducing initial bundle size and improving time-to-interactive.
 *
 * Previously, i18n was imported as a side-effect in index.tsx,
 * which loaded all translation JSONs before the app could render.
 */

let i18nInitialized = false;
let initializationPromise: Promise<void> | null = null;

/**
 * Initialize i18n on demand
 * Safe to call multiple times - will only initialize once
 */
export async function initializeI18n(): Promise<void> {
  if (i18nInitialized) {
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
      await import('../i18n');
      i18nInitialized = true;
      console.log('[i18n] Internationalization initialized');
    } catch (error) {
      console.error('[i18n] Failed to initialize i18n:', error);
      // Reset so it can be retried
      initializationPromise = null;
      throw error;
    }
  })();

  return initializationPromise;
}

/**
 * Check if i18n is ready without initializing it
 */
export function isI18nReady(): boolean {
  return i18nInitialized;
}

/**
 * Reset initialization state (for testing)
 */
export function resetI18n(): void {
  i18nInitialized = false;
  initializationPromise = null;
}
