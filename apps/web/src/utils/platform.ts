/**
 * Platform detection utilities for conditional rendering
 * between web and desktop (Tauri) environments.
 */

export const isDesktopApp = (): boolean => {
  return typeof window !== 'undefined' && '__TAURI__' in window;
};

export const isWebApp = (): boolean => {
  return !isDesktopApp();
};
