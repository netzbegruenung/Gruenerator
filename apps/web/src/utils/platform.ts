/**
 * Platform detection utilities for conditional rendering
 * between web, desktop (Tauri), and mobile (Capacitor) environments.
 */

export const isDesktopApp = (): boolean => {
  return typeof window !== 'undefined' && '__TAURI__' in window;
};

export const isCapacitorApp = (): boolean => {
  if (typeof window === 'undefined') return false;
  return (
    (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.() ?? false
  );
};

export const isMobileApp = (): boolean => {
  return isCapacitorApp();
};

export const isNativeApp = (): boolean => {
  return isDesktopApp() || isCapacitorApp();
};

export const isWebApp = (): boolean => {
  return !isNativeApp();
};

export type AppContext = 'web' | 'desktop' | 'capacitor';

export const getAppContext = (): AppContext => {
  if (isDesktopApp()) return 'desktop';
  if (isCapacitorApp()) return 'capacitor';
  return 'web';
};
