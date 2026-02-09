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
