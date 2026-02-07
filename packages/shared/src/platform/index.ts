/**
 * Platform detection utilities for cross-platform code sharing
 * Works in web, Tauri desktop, Capacitor mobile, and React Native mobile environments
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
    Capacitor?: {
      isNativePlatform: () => boolean;
      getPlatform: () => 'ios' | 'android' | 'web';
      isPluginAvailable: (plugin: string) => boolean;
    };
  }
}

export type Platform = 'web' | 'windows' | 'macos' | 'linux' | 'ios' | 'android' | 'unknown';
export type AppContext = 'web' | 'desktop' | 'capacitor' | 'expo';

/**
 * Check if running inside Tauri desktop app
 */
export const isTauri = (): boolean => {
  if (typeof window === 'undefined') return false;
  return '__TAURI__' in window;
};

/**
 * Check if running inside Capacitor mobile app
 */
export const isCapacitor = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.Capacitor?.isNativePlatform?.() ?? false;
};

/**
 * Check if running as desktop app (Tauri)
 */
export const isDesktop = (): boolean => isTauri();

/**
 * Check if running in web browser (not Tauri or Capacitor)
 */
export const isWeb = (): boolean => {
  if (typeof window === 'undefined') return false;
  return !isTauri() && !isCapacitor() && !isMobile();
};

/**
 * Check if running in React Native mobile app (Expo)
 */
export const isMobile = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  // @ts-ignore - React Native specific
  return typeof navigator.product === 'string' && navigator.product === 'ReactNative';
};

/**
 * Check if running in any mobile app (Capacitor or Expo)
 */
export const isMobileApp = (): boolean => isCapacitor() || isMobile();

/**
 * Check if running in any native app (Tauri, Capacitor, or Expo)
 */
export const isNativeApp = (): boolean => isTauri() || isCapacitor() || isMobile();

/**
 * Get the app context (where the app is running)
 */
export const getAppContext = (): AppContext => {
  if (isTauri()) return 'desktop';
  if (isCapacitor()) return 'capacitor';
  if (isMobile()) return 'expo';
  return 'web';
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

  // Check for Capacitor mobile
  if (isCapacitor()) {
    const capacitorPlatform = window.Capacitor?.getPlatform?.();
    if (capacitorPlatform === 'ios') return 'ios';
    if (capacitorPlatform === 'android') return 'android';
    return 'unknown';
  }

  // Check for React Native mobile (Expo)
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
  hasFileSystem: isDesktop() || isCapacitor(),
  hasNativeDialogs: isDesktop(),
  hasNotifications: isDesktop() || isMobileApp(),
  hasDeepLinks: isDesktop() || isMobileApp(),
  hasKeyboardShortcuts: isDesktop() || isWeb(),
  hasTouchInput: isMobileApp() || isWeb(),
  hasWindowControls: isDesktop(),
  hasCamera: isMobileApp(),
  hasShare: isMobileApp() || isDesktop(),
  hasClipboard: true, // Available on all platforms
  hasBrowser: isMobileApp(), // In-app browser for OAuth
  hasSecureStorage: isDesktop() || isCapacitor(),
});

/**
 * Check if a Capacitor plugin is available
 */
export const isCapacitorPluginAvailable = (plugin: string): boolean => {
  if (!isCapacitor()) return false;
  return window.Capacitor?.isPluginAvailable?.(plugin) ?? false;
};
