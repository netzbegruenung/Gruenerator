/**
 * Mobile Share Service
 * Platform-specific sharing functionality using Expo APIs
 */

import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { Share as RNShare, Linking, Platform } from 'react-native';
import { getPlatformShareUrl, type SharePlatform } from '@gruenerator/shared';
import { getErrorMessage } from '../utils/errors';

/**
 * Check if native sharing is available on this device
 */
export async function isShareAvailable(): Promise<boolean> {
  return Sharing.isAvailableAsync();
}

/**
 * Share a local file (video/image) via native share sheet
 * @param fileUri - Local file URI to share
 * @param options - Optional mime type and dialog title
 */
export async function shareFile(
  fileUri: string,
  options?: {
    mimeType?: string;
    dialogTitle?: string;
  }
): Promise<void> {
  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    throw new Error('Sharing is not available on this device');
  }

  await Sharing.shareAsync(fileUri, {
    mimeType: options?.mimeType || 'video/mp4',
    dialogTitle: options?.dialogTitle || 'Teilen',
    UTI: Platform.OS === 'ios' ? 'public.movie' : undefined,
  });
}

/**
 * Share a URL or text via native share sheet
 * @param url - URL to share
 * @param title - Optional title
 * @param message - Optional message
 */
export async function shareUrl(url: string, title?: string, message?: string): Promise<boolean> {
  try {
    const shareContent =
      Platform.OS === 'ios'
        ? { url, message, title }
        : { message: message ? `${message}\n${url}` : url, title };

    const result = await RNShare.share(shareContent);

    return result.action === RNShare.sharedAction;
  } catch (error: unknown) {
    console.error('[ShareService] shareUrl error:', getErrorMessage(error));
    return false;
  }
}

/**
 * Copy text to clipboard
 * @param text - Text to copy
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await Clipboard.setStringAsync(text);
    return true;
  } catch (error: unknown) {
    console.error('[ShareService] copyToClipboard error:', getErrorMessage(error));
    return false;
  }
}

/**
 * Get clipboard content
 */
export async function getClipboardContent(): Promise<string> {
  return Clipboard.getStringAsync();
}

/**
 * Open a social platform share dialog
 * Opens Twitter, Facebook, or LinkedIn with pre-filled text
 * @param platform - Platform to share to
 * @param text - Text to share
 * @param url - Optional URL to include
 */
export async function openPlatformShare(
  platform: SharePlatform,
  text: string,
  url?: string
): Promise<boolean> {
  const shareUrl = getPlatformShareUrl(platform, text, url);

  if (!shareUrl) {
    // Platform doesn't have a web share URL (e.g., Instagram)
    // Fall back to native share sheet
    return shareUrl ? await shareUrlViaNative(text, url) : false;
  }

  try {
    const canOpen = await Linking.canOpenURL(shareUrl);
    if (canOpen) {
      await Linking.openURL(shareUrl);
      return true;
    }
    return false;
  } catch (error: unknown) {
    console.error(
      `[ShareService] openPlatformShare error for ${platform}:`,
      getErrorMessage(error)
    );
    return false;
  }
}

/**
 * Share via native share sheet as fallback
 */
async function shareUrlViaNative(text: string, url?: string): Promise<boolean> {
  return shareUrl(url || '', undefined, text);
}

/**
 * Check if a URL can be opened
 */
export async function canOpenUrl(url: string): Promise<boolean> {
  try {
    return Linking.canOpenURL(url);
  } catch {
    return false;
  }
}

/**
 * Open a URL in the default browser
 */
export async function openUrl(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch (error: unknown) {
    console.error('[ShareService] openUrl error:', getErrorMessage(error));
    return false;
  }
}

/**
 * Share service object for convenient access
 */
export const shareService = {
  isShareAvailable,
  shareFile,
  shareUrl,
  copyToClipboard,
  getClipboardContent,
  openPlatformShare,
  canOpenUrl,
  openUrl,
};
