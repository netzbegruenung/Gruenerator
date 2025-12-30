/**
 * Platform detection utilities for cross-platform code sharing
 * Works in web, Tauri desktop, and React Native mobile environments
 */

/// <reference lib="dom" />

declare global {
  interface Window {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: {
      metadata?: {
        currentPlatform?: string;
      };
    };
  }
}

export type Platform = 'web' | 'windows' | 'macos' | 'linux' | 'ios' | 'android' | 'unknown';

/**
 * Check if running inside Tauri desktop app
 */
export const isTauri = (): boolean => {
  if (typeof window === 'undefined') return false;
  return '__TAURI__' in window;
};

/**
 * Check if running as desktop app (Tauri)
 */
export const isDesktop = (): boolean => isTauri();

/**
 * Check if running in web browser (not Tauri)
 */
export const isWeb = (): boolean => {
  if (typeof window === 'undefined') return false;
  return !isTauri();
};

/**
 * Check if running in React Native mobile app
 */
export const isMobile = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  // @ts-ignore - React Native specific
  return typeof navigator.product === 'string' && navigator.product === 'ReactNative';
};

/**
 * Get the current platform
 */
export const getPlatform = (): Platform => {
  if (typeof window === 'undefined') return 'unknown';

  // Check for Tauri desktop
  if (isTauri()) {
    const tauriPlatform = window.__TAURI_INTERNALS__?.metadata?.currentPlatform;
    if (tauriPlatform) {
      if (tauriPlatform.includes('windows')) return 'windows';
      if (tauriPlatform.includes('darwin') || tauriPlatform.includes('macos')) return 'macos';
      if (tauriPlatform.includes('linux')) return 'linux';
    }
    return 'unknown';
  }

  // Check for React Native mobile
  if (isMobile()) {
    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent || '';
      if (/android/i.test(ua)) return 'android';
      if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
    }
    return 'unknown';
  }

  return 'web';
};

/**
 * Check if running on Windows (desktop only)
 */
export const isWindows = (): boolean => getPlatform() === 'windows';

/**
 * Check if running on macOS (desktop only)
 */
export const isMacOS = (): boolean => getPlatform() === 'macos';

/**
 * Check if running on Linux (desktop only)
 */
export const isLinux = (): boolean => getPlatform() === 'linux';

/**
 * Check if running on iOS (mobile only)
 */
export const isIOS = (): boolean => getPlatform() === 'ios';

/**
 * Check if running on Android (mobile only)
 */
export const isAndroid = (): boolean => getPlatform() === 'android';

/**
 * Get platform-specific feature availability
 */
export const getPlatformCapabilities = () => ({
  hasFileSystem: isDesktop(),
  hasNativeDialogs: isDesktop(),
  hasNotifications: isDesktop() || isMobile(),
  hasDeepLinks: isDesktop() || isMobile(),
  hasKeyboardShortcuts: isDesktop() || isWeb(),
  hasTouchInput: isMobile() || isWeb(),
  hasWindowControls: isDesktop(),
});
