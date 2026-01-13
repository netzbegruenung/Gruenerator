/**
 * Share Utils - Web-specific sharing functionality
 * Re-exports platform-agnostic code from @gruenerator/shared
 */

// Re-export platform-agnostic functions from shared package
export {
  parsePlatformSections,
  getPlatformDisplayName,
  getPlatformShareUrl,
  PLATFORM_CONFIGS,
  PLATFORM_MAPPINGS,
} from '@gruenerator/shared';

// Share content interface
interface ShareContentOptions {
  title?: string;
  text?: string;
  url?: string;
}

/**
 * Check if Web Share API is available
 */
export const canShare = (): boolean => {
  return typeof navigator !== 'undefined' && navigator.share !== undefined;
};

/**
 * Share content using Web Share API
 */
export const shareContent = async ({ title, text, url }: ShareContentOptions): Promise<boolean> => {
  if (!canShare()) {
    throw new Error('Web Share API not supported');
  }

  try {
    await navigator.share({
      title,
      text,
      url,
    });
    return true;
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return false;
    }
    throw error;
  }
};

/**
 * Copy text to clipboard
 */
export const copyToClipboard = async (text: string): Promise<boolean> => {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  // Fallback for older browsers
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  document.body.appendChild(textArea);
  textArea.select();

  try {
    document.execCommand('copy');
    return true;
  } finally {
    document.body.removeChild(textArea);
  }
};

/**
 * Check if the device is mobile
 */
export const isMobileDevice = (): boolean => {
  if (typeof navigator === 'undefined') return false;

  const userAgent = navigator.userAgent || '';
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
  const hasTouchAndSmallScreen = navigator.maxTouchPoints > 0 && window.innerWidth <= 768;

  return isMobileUA || hasTouchAndSmallScreen;
};

/**
 * Check if file sharing is supported
 */
export const canShareFiles = async (): Promise<boolean> => {
  if (!canShare() || !navigator.canShare) return false;

  try {
    const testBlob = new Blob(['test'], { type: 'image/png' });
    const testFile = new File([testBlob], 'test.png', { type: 'image/png' });
    return navigator.canShare({ files: [testFile] });
  } catch {
    return false;
  }
};

/**
 * Share an image file using Web Share API
 */
export const shareImageFile = async (
  base64Image: string,
  title: string = 'Sharepic'
): Promise<boolean> => {
  const canShareResult = await canShareFiles();
  if (!canShareResult) {
    throw new Error('File sharing not supported on this device');
  }

  try {
    const response = await fetch(base64Image);
    const blob = await response.blob();
    const mimeType = blob.type || 'image/png';
    const extension = mimeType.split('/')[1] || 'png';
    const file = new File([blob], `gruenerator-sharepic.${extension}`, { type: mimeType });

    await navigator.share({
      files: [file],
      title: title,
    });
    return true;
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return false;
    }
    throw error;
  }
};

/**
 * Copy an image to clipboard (PNG only)
 */
export const copyImageToClipboard = async (base64Image: string): Promise<boolean> => {
  if (!navigator.clipboard || !navigator.clipboard.write) {
    throw new Error('Clipboard API not supported');
  }

  try {
    const response = await fetch(base64Image);
    const blob = await response.blob();

    const pngBlob: Blob = blob.type === 'image/png'
      ? blob
      : await convertToPng(blob);

    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': pngBlob })
    ]);
    return true;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error('Failed to copy image to clipboard: ' + errorMessage);
  }
};

/**
 * Convert an image blob to PNG format
 */
const convertToPng = async (blob: Blob): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((resultBlob) => {
          if (resultBlob) {
            resolve(resultBlob);
          } else {
            reject(new Error('Failed to convert to PNG'));
          }
        }, 'image/png');
      } else {
        reject(new Error('Failed to get canvas context'));
      }
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
};

/**
 * Open a platform-specific share dialog
 * Uses getPlatformShareUrl from shared package
 */
export const openPlatformShare = (platformId: string, text: string): boolean => {
  // Import dynamically to avoid circular dependency issues
  const { getPlatformShareUrl } = require('@gruenerator/shared');
  const url = getPlatformShareUrl(platformId, text);
  if (url) {
    window.open(url, '_blank', 'width=600,height=400,noopener,noreferrer');
    return true;
  }
  return false;
};

/**
 * Check if a platform has a share URL
 */
export const hasPlatformShareUrl = (platformId: string): boolean => {
  const { PLATFORM_CONFIGS } = require('@gruenerator/shared');
  return PLATFORM_CONFIGS[platformId]?.hasShareUrl === true;
};
