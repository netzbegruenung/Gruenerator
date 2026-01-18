/**
 * Tauri window utilities with proper initialization handling.
 *
 * Tauri 2.x has a known issue where `window.__TAURI_INTERNALS__` may not be
 * initialized immediately on app startup, causing getCurrentWindow() to fail.
 * These utilities add safety checks and retry logic to handle this timing issue.
 *
 * @see https://github.com/tauri-apps/tauri/issues/12694
 */

import { isDesktopApp } from './platform';

type TauriWindow = Awaited<ReturnType<typeof import('@tauri-apps/api/window').getCurrentWindow>>;

/**
 * Checks if Tauri internals are fully initialized.
 * The __TAURI__ object may exist before __TAURI_INTERNALS__ is ready.
 */
export const isTauriReady = (): boolean => {
  return (
    typeof window !== 'undefined' &&
    '__TAURI_INTERNALS__' in window &&
    window.__TAURI_INTERNALS__ !== undefined
  );
};

/**
 * Waits for Tauri to be fully initialized (max 2 seconds).
 * Returns true if Tauri became ready, false if timeout.
 */
const waitForTauri = (maxWaitMs = 2000): Promise<boolean> => {
  return new Promise((resolve) => {
    if (isTauriReady()) {
      resolve(true);
      return;
    }

    const startTime = Date.now();
    const interval = setInterval(() => {
      if (isTauriReady()) {
        clearInterval(interval);
        resolve(true);
      } else if (Date.now() - startTime > maxWaitMs) {
        clearInterval(interval);
        resolve(false);
      }
    }, 20);
  });
};

/**
 * Safely gets the current Tauri window with initialization handling.
 * Returns null if not in desktop app or if Tauri fails to initialize.
 */
export const getSafeCurrentWindow = async (): Promise<TauriWindow | null> => {
  if (!isDesktopApp()) {
    return null;
  }

  const ready = await waitForTauri();
  if (!ready) {
    console.warn('[Tauri] Timeout waiting for Tauri internals to initialize');
    return null;
  }

  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    return getCurrentWindow();
  } catch (error) {
    console.error('[Tauri] Failed to get current window:', error);
    return null;
  }
};

/**
 * Safely minimize the current window.
 */
export const minimizeWindow = async (): Promise<void> => {
  const win = await getSafeCurrentWindow();
  if (win) {
    await win.minimize();
  }
};

/**
 * Safely maximize or unmaximize the current window.
 */
export const toggleMaximizeWindow = async (): Promise<void> => {
  const win = await getSafeCurrentWindow();
  if (win) {
    const isMaximized = await win.isMaximized();
    if (isMaximized) {
      await win.unmaximize();
    } else {
      await win.maximize();
    }
  }
};

/**
 * Safely close the current window.
 */
export const closeWindow = async (): Promise<void> => {
  const win = await getSafeCurrentWindow();
  if (win) {
    await win.close();
  }
};
