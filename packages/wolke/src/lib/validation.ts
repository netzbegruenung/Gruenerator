import { type ParsedShareLink, type ShareLink, type ShareLinkValidationResult } from '../types';

export function validateShareLink(url: string): ShareLinkValidationResult {
  if (!url || typeof url !== 'string') {
    return { isValid: false, error: 'Share link ist erforderlich' };
  }

  const parsed = parseShareLink(url);
  if (!parsed) {
    return { isValid: false, error: 'Ungültiges Nextcloud Share-Link Format' };
  }

  return {
    isValid: true,
    shareToken: parsed.shareToken,
    baseUrl: parsed.baseUrl,
    error: null,
  };
}

export function parseShareLink(url: string): ParsedShareLink | null {
  try {
    const urlObj = new URL(url);
    const pathMatch = urlObj.pathname.match(/\/s\/([A-Za-z0-9]+)/);
    if (!pathMatch?.[1]) return null;

    return {
      baseUrl: `${urlObj.protocol}//${urlObj.host}`,
      shareToken: pathMatch[1],
      fullPath: urlObj.pathname + urlObj.search,
    };
  } catch {
    return null;
  }
}

export function generateDisplayName(
  shareLink: ShareLink,
  fallback = 'Unbenannte Verbindung'
): string {
  if (shareLink.label?.trim()) {
    return shareLink.label.trim();
  }

  if (shareLink.share_link) {
    const parsed = parseShareLink(shareLink.share_link);
    if (parsed) {
      return `${parsed.baseUrl.replace(/^https?:\/\//, '')} (${parsed.shareToken})`;
    }
  }

  return fallback;
}

export function generateDisplayUrl(shareLink: ShareLink): string {
  if (shareLink.share_link) {
    return shareLink.share_link.replace(/^https?:\/\//, '');
  }
  return 'Ungültige URL';
}
