/**
 * Desktop (Tauri) feature utilities
 * Handles menu events, autostart, theme sync, and other desktop-specific features
 */

import { isDesktopApp } from './platform';

type UnlistenFn = () => void;
let menuListenerCleanups: UnlistenFn[] = [];

export interface DesktopMenuEvents {
  onNew?: () => void;
  onSettings?: () => void;
  onReload?: () => void;
  onZoom?: (direction: 'in' | 'out' | 'reset') => void;
  onOpenUrl?: (url: string) => void;
  onAbout?: () => void;
}

/**
 * Initialize desktop menu event listeners
 */
export async function initDesktopMenuEvents(handlers: DesktopMenuEvents): Promise<void> {
  if (!isDesktopApp()) return;

  try {
    const { listen } = await import('@tauri-apps/api/event');
    const { open } = await import('@tauri-apps/plugin-shell');

    if (handlers.onNew) {
      const unlisten = await listen('menu-new', handlers.onNew);
      menuListenerCleanups.push(unlisten);
    }

    if (handlers.onSettings) {
      const unlisten = await listen('menu-settings', handlers.onSettings);
      menuListenerCleanups.push(unlisten);
    }

    if (handlers.onReload) {
      const unlisten = await listen('menu-reload', () => {
        window.location.reload();
      });
      menuListenerCleanups.push(unlisten);
    }

    if (handlers.onZoom) {
      const unlisten = await listen<string>('menu-zoom', (event) => {
        const direction = event.payload as 'in' | 'out' | 'reset';
        if (direction === 'in') {
          document.body.style.zoom = String(parseFloat(document.body.style.zoom || '1') + 0.1);
        } else if (direction === 'out') {
          document.body.style.zoom = String(Math.max(0.5, parseFloat(document.body.style.zoom || '1') - 0.1));
        } else {
          document.body.style.zoom = '1';
        }
        handlers.onZoom?.(direction);
      });
      menuListenerCleanups.push(unlisten);
    }

    const unlistenUrl = await listen<string>('menu-open-url', async (event) => {
      const url = event.payload;
      await open(url);
      handlers.onOpenUrl?.(url);
    });
    menuListenerCleanups.push(unlistenUrl);

    if (handlers.onAbout) {
      const unlisten = await listen('menu-about', handlers.onAbout);
      menuListenerCleanups.push(unlisten);
    }

    console.log('[DesktopFeatures] Menu event listeners initialized');
  } catch (error) {
    console.error('[DesktopFeatures] Failed to initialize menu listeners:', error);
  }
}

/**
 * Clean up menu event listeners
 */
export function cleanupDesktopMenuEvents(): void {
  menuListenerCleanups.forEach(cleanup => cleanup());
  menuListenerCleanups = [];
}

/**
 * Get autostart enabled status
 */
export async function getAutostartEnabled(): Promise<boolean> {
  if (!isDesktopApp()) return false;

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<boolean>('get_autostart_enabled');
  } catch (error) {
    console.error('[DesktopFeatures] Failed to get autostart status:', error);
    return false;
  }
}

/**
 * Set autostart enabled status
 */
export async function setAutostartEnabled(enabled: boolean): Promise<boolean> {
  if (!isDesktopApp()) return false;

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('set_autostart_enabled', { enabled });
    return true;
  } catch (error) {
    console.error('[DesktopFeatures] Failed to set autostart:', error);
    return false;
  }
}

/**
 * Get current system theme
 */
export async function getSystemTheme(): Promise<'dark' | 'light'> {
  if (!isDesktopApp()) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const theme = await invoke<string>('get_system_theme');
    return theme as 'dark' | 'light';
  } catch (error) {
    console.error('[DesktopFeatures] Failed to get system theme:', error);
    return 'light';
  }
}

/**
 * Set window theme
 */
export async function setWindowTheme(theme: 'dark' | 'light' | 'auto'): Promise<boolean> {
  if (!isDesktopApp()) return false;

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('set_window_theme', { theme });
    return true;
  } catch (error) {
    console.error('[DesktopFeatures] Failed to set window theme:', error);
    return false;
  }
}

let themeChangeCleanup: UnlistenFn | null = null;

/**
 * Listen for system theme changes
 */
export async function listenForThemeChanges(
  onThemeChange: (theme: 'dark' | 'light') => void
): Promise<void> {
  if (!isDesktopApp()) {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      onThemeChange(e.matches ? 'dark' : 'light');
    };
    mediaQuery.addEventListener('change', handler);
    themeChangeCleanup = () => mediaQuery.removeEventListener('change', handler);
    return;
  }

  try {
    const { listen } = await import('@tauri-apps/api/event');
    themeChangeCleanup = await listen<string>('system-theme-changed', (event) => {
      onThemeChange(event.payload as 'dark' | 'light');
    });
    console.log('[DesktopFeatures] Theme change listener initialized');
  } catch (error) {
    console.error('[DesktopFeatures] Failed to initialize theme listener:', error);
  }
}

/**
 * Clean up theme change listener
 */
export function cleanupThemeListener(): void {
  if (themeChangeCleanup) {
    themeChangeCleanup();
    themeChangeCleanup = null;
  }
}

/**
 * Close splash screen and show main window
 */
export async function closeSplashscreen(): Promise<void> {
  if (!isDesktopApp()) return;

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('close_splashscreen');
  } catch (error) {
    console.error('[DesktopFeatures] Failed to close splashscreen:', error);
  }
}
