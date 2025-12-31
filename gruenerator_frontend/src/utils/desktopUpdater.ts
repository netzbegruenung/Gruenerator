/**
 * Desktop (Tauri) Auto-Updater Service
 * Handles background checking, downloading, and installing of app updates
 */

import { isDesktopApp } from './platform';
import { useDesktopUpdateStore, type UpdateInfo } from '../stores/desktopUpdateStore';

type Update = {
  available: boolean;
  version?: string;
  currentVersion: string;
  date?: string;
  body?: string;
  download: () => Promise<void>;
  downloadAndInstall: (onEvent?: (event: DownloadEvent) => void) => Promise<void>;
};

type DownloadEvent = {
  event: 'Started' | 'Progress' | 'Finished';
  data: {
    contentLength?: number;
    chunkLength?: number;
  };
};

let updateInstance: Update | null = null;
let checkIntervalId: ReturnType<typeof setInterval> | null = null;

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const STARTUP_DELAY_MS = 10 * 1000; // 10 seconds after app start

/**
 * Check for available updates
 * @param silent If true, doesn't update status to 'checking' (for background checks)
 */
export async function checkForUpdates(silent = false): Promise<boolean> {
  if (!isDesktopApp()) return false;

  const store = useDesktopUpdateStore.getState();

  if (!silent) {
    store.setStatus('checking');
  }

  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const { getVersion } = await import('@tauri-apps/api/app');

    const currentVersion = await getVersion();
    const update = await check();

    store.setLastCheckTime(Date.now());

    if (update?.available && update.version) {
      updateInstance = update as Update;

      const updateInfo: UpdateInfo = {
        version: update.version,
        currentVersion,
        date: update.date,
        body: update.body,
      };

      store.setUpdateInfo(updateInfo);
      store.setStatus('available');

      console.log(`[Updater] Update available: ${currentVersion} → ${update.version}`);
      return true;
    } else {
      store.setStatus('up-to-date');
      console.log('[Updater] App is up to date');
      return false;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Updater] Check failed:', errorMessage);

    if (!silent) {
      store.setError(errorMessage);
    }
    return false;
  }
}

/**
 * Download the available update in the background
 */
export async function downloadUpdate(): Promise<boolean> {
  if (!isDesktopApp() || !updateInstance) {
    console.warn('[Updater] No update available to download');
    return false;
  }

  const store = useDesktopUpdateStore.getState();
  store.setStatus('downloading');
  store.setDownloadProgress(0);

  let totalBytes = 0;
  let downloadedBytes = 0;

  try {
    await updateInstance.downloadAndInstall((event) => {
      switch (event.event) {
        case 'Started':
          totalBytes = event.data.contentLength || 0;
          console.log(`[Updater] Download started: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
          break;
        case 'Progress':
          downloadedBytes += event.data.chunkLength || 0;
          const progress = totalBytes > 0 ? (downloadedBytes / totalBytes) * 100 : 0;
          store.setDownloadProgress(Math.round(progress));
          break;
        case 'Finished':
          store.setDownloadProgress(100);
          console.log('[Updater] Download finished');
          break;
      }
    });

    store.setStatus('ready');
    console.log('[Updater] Update ready to install');
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Download failed';
    console.error('[Updater] Download failed:', errorMessage);
    store.setError(errorMessage);
    return false;
  }
}

/**
 * Install the downloaded update (will restart the app on Windows)
 */
export async function installUpdate(): Promise<void> {
  if (!isDesktopApp()) return;

  const store = useDesktopUpdateStore.getState();
  store.setStatus('installing');

  try {
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Install failed';
    console.error('[Updater] Install failed:', errorMessage);
    store.setError(errorMessage);
  }
}

/**
 * Check and download update automatically (fire-and-forget)
 */
export async function checkAndDownloadUpdate(): Promise<void> {
  const hasUpdate = await checkForUpdates(true);
  if (hasUpdate) {
    await downloadUpdate();
  }
}

/**
 * Initialize the auto-updater with periodic background checks
 */
export async function initAutoUpdater(): Promise<void> {
  if (!isDesktopApp()) return;

  console.log('[Updater] Initializing auto-updater...');

  setTimeout(async () => {
    await checkAndDownloadUpdate();
  }, STARTUP_DELAY_MS);

  if (checkIntervalId) {
    clearInterval(checkIntervalId);
  }

  checkIntervalId = setInterval(async () => {
    const store = useDesktopUpdateStore.getState();
    if (store.status === 'idle' || store.status === 'up-to-date') {
      await checkAndDownloadUpdate();
    }
  }, CHECK_INTERVAL_MS);

  console.log('[Updater] Auto-updater initialized');
}

/**
 * Clean up the auto-updater
 */
export function cleanupAutoUpdater(): void {
  if (checkIntervalId) {
    clearInterval(checkIntervalId);
    checkIntervalId = null;
  }
  updateInstance = null;
  console.log('[Updater] Auto-updater cleaned up');
}

/**
 * Get the current app version
 */
export async function getCurrentVersion(): Promise<string> {
  if (!isDesktopApp()) return 'web';

  try {
    const { getVersion } = await import('@tauri-apps/api/app');
    return await getVersion();
  } catch {
    return 'unknown';
  }
}

/**
 * Manually trigger an update check (from menu or settings)
 * This resets the dismissed state so the notification will show again
 */
export async function manualCheckForUpdates(): Promise<void> {
  if (!isDesktopApp()) return;

  const store = useDesktopUpdateStore.getState();

  // Reset state to allow notification to show
  store.reset();

  // Perform the check (not silent, shows "checking" status)
  const hasUpdate = await checkForUpdates(false);

  if (hasUpdate) {
    // Automatically start downloading
    await downloadUpdate();
  }
}

/**
 * Check for updates using Rust command (alternative method)
 */
export async function checkForUpdateViaRust(): Promise<{
  available: boolean;
  version?: string;
  currentVersion: string;
}> {
  if (!isDesktopApp()) {
    return { available: false, currentVersion: 'web' };
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke('check_for_update');
  } catch (error) {
    console.error('[Updater] Rust check failed:', error);
    return { available: false, currentVersion: 'unknown' };
  }
}
