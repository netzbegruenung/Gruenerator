/**
 * Platform detection utilities for conditional rendering
 * between web and desktop (Tauri) environments.
 */

export const isDesktopApp = (): boolean => {
  return typeof window !== 'undefined' && '__TAURI__' in window;
};

export const isNativeApp = (): boolean => {
  return isDesktopApp();
};

export const isWebApp = (): boolean => {
  return !isNativeApp();
};

export type AppContext = 'web' | 'desktop';

export const getAppContext = (): AppContext => {
  if (isDesktopApp()) return 'desktop';
  return 'web';
};

export type DesktopOS = 'macos' | 'windows' | 'linux' | 'unknown';

/**
 * Detects the host OS for the desktop (Tauri) shell so the title bar can follow
 * platform conventions: native traffic lights on macOS, custom caption controls
 * on Windows/Linux. Synchronous (UA-based) so it is safe to use during render.
 */
export const getDesktopOS = (): DesktopOS => {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent;
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macos';
  if (/Windows/i.test(ua)) return 'windows';
  if (/Linux|X11/i.test(ua)) return 'linux';
  return 'unknown';
};

export const isMacDesktop = (): boolean => isDesktopApp() && getDesktopOS() === 'macos';
