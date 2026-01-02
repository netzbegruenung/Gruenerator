/**
 * Share URL generation utilities
 */

import type { SharePlatform } from '../types.js';
import { PLATFORM_CONFIGS } from '../constants.js';

/**
 * Generate a share URL for a given share token
 * @param shareToken - The share token from backend
 * @param baseUrl - Optional base URL (defaults to env or hardcoded)
 * @returns Full share URL
 */
export function getShareUrl(shareToken: string, baseUrl?: string): string {
  // For mobile, use the provided baseUrl or fall back to production URL
  // For web, use window.location.origin if available
  const base = baseUrl || getBaseUrl();
  return `${base}/share/${shareToken}`;
}

/**
 * Generate a share URL for subtitler videos
 * @param shareToken - The share token from backend
 * @param baseUrl - Optional base URL
 * @returns Full subtitler share URL
 */
export function getSubtitlerShareUrl(shareToken: string, baseUrl?: string): string {
  const base = baseUrl || getBaseUrl();
  return `${base}/subtitler/share/${shareToken}`;
}

/**
 * Get the base URL for share links
 * Platform-aware: uses window.location.origin on web, falls back to production URL
 */
export function getBaseUrl(): string {
  // Check for browser environment
  if (typeof globalThis !== 'undefined' && 'window' in globalThis) {
    const win = globalThis as unknown as { window: { location?: { origin?: string } } };
    if (win.window?.location?.origin) {
      return win.window.location.origin;
    }
  }

  // Check for process.env (React Native/Node)
  if (typeof process !== 'undefined' && process.env) {
    const envUrl = process.env.EXPO_PUBLIC_BASE_URL || process.env.REACT_APP_BASE_URL;
    if (envUrl) {
      return envUrl;
    }
  }

  // Default to production URL
  return 'https://gruenerator.eu';
}

/**
 * Get the platform-specific share URL for opening social media share dialogs
 * @param platformId - Platform identifier
 * @param text - Text to share
 * @param url - Optional URL to share
 * @returns Share URL or null if platform doesn't support direct sharing
 */
export function getPlatformShareUrl(
  platformId: SharePlatform,
  text: string,
  url?: string
): string | null {
  const config = PLATFORM_CONFIGS[platformId];

  if (!config || !config.hasShareUrl || !config.getShareUrl) {
    return null;
  }

  return config.getShareUrl(text, url);
}

/**
 * Generate a QR code data URL (placeholder - actual implementation platform-specific)
 * @param url - URL to encode
 * @returns Data URL string or null
 */
export function generateQrCodeUrl(url: string): string | null {
  // This is a placeholder - actual QR code generation is platform-specific
  // Web uses react-qr-code, Mobile uses react-native-qrcode-svg
  return null;
}
