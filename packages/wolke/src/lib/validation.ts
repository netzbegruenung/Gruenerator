import { checkCloudShareLink, parseCloudShareLink } from '@gruenerator/shared/utils';

import { type ParsedShareLink, type ShareLink, type ShareLinkValidationResult } from '../types';

/**
 * Die Zerlegung liegt in `@gruenerator/shared/utils` — dieselbe, die das Backend
 * benutzt. Hier bleibt nur der deutsche Wortlaut, weil er im Einrichtungs-
 * Assistenten steht.
 */
export function validateShareLink(url: string): ShareLinkValidationResult {
  const check = checkCloudShareLink(url);
  if (check.ok) {
    return {
      isValid: true,
      shareToken: check.parsed.shareToken,
      baseUrl: check.parsed.baseUrl,
      error: null,
    };
  }
  const errors: Record<typeof check.problem, string> = {
    empty: 'Share link ist erforderlich',
    not_a_url: 'Ungültiges Nextcloud Share-Link Format',
    no_share_token: 'Ungültiges Nextcloud Share-Link Format',
  };
  return { isValid: false, error: errors[check.problem] };
}

export function parseShareLink(url: string): ParsedShareLink | null {
  return parseCloudShareLink(url);
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
