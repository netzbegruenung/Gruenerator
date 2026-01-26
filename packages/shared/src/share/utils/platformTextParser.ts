/**
 * Platform text parsing utilities
 * Extract platform-specific text sections from markdown content
 */

import type { SharePlatform, PlatformSections } from '../types.js';
import { PLATFORM_MAPPINGS } from '../constants.js';

/**
 * Normalize a platform name to its canonical ID
 * @param platformName - Raw platform name from content
 * @returns Normalized platform ID or original name if not found
 */
export function normalizePlatformId(platformName: string): string {
  const name = platformName.toLowerCase().trim();

  for (const [id, aliases] of Object.entries(PLATFORM_MAPPINGS)) {
    if (aliases.some((alias) => name.includes(alias))) {
      return id;
    }
  }

  return name;
}

/**
 * Parse platform-specific sections from markdown content
 *
 * Content format:
 * ## Instagram
 * Text for Instagram...
 *
 * ## Twitter
 * Text for Twitter...
 *
 * @param content - Markdown content with platform sections
 * @param allowedPlatforms - Optional list of platforms to extract (empty = all)
 * @returns Object mapping platform IDs to their text content
 */
export function parsePlatformSections(
  content: string | null | undefined,
  allowedPlatforms: SharePlatform[] = []
): PlatformSections {
  if (!content || typeof content !== 'string') {
    return {};
  }

  const MAX_CONTENT_LENGTH = 100000;
  const safeContent =
    content.length > MAX_CONTENT_LENGTH ? content.slice(0, MAX_CONTENT_LENGTH) : content;

  const sections: PlatformSections = {};
  const platformNames = [
    'Instagram',
    'Facebook',
    'Twitter',
    'LinkedIn',
    'Pressemitteilung',
    'X',
    'Mastodon',
    'Bsky',
    'Bluesky',
  ];
  const headerRegex =
    /^##\s*(Instagram|Facebook|Twitter|LinkedIn|Pressemitteilung|X,?\s*Mastodon|Bsky|Bluesky)[^\n]*/gim;

  const headers: { index: number; platform: string }[] = [];
  let headerMatch;
  while ((headerMatch = headerRegex.exec(safeContent)) !== null) {
    const platformName = headerMatch[1];
    if (platformNames.some((p) => platformName.toLowerCase().includes(p.toLowerCase()))) {
      headers.push({ index: headerMatch.index, platform: platformName });
    }
  }

  for (let i = 0; i < headers.length; i++) {
    const startIdx = safeContent.indexOf('\n', headers[i].index);
    if (startIdx === -1) continue;

    const endIdx = i < headers.length - 1 ? headers[i + 1].index : safeContent.length;
    const text = safeContent.slice(startIdx + 1, endIdx).trim();
    const normalizedId = normalizePlatformId(headers[i].platform) as SharePlatform;

    if (allowedPlatforms.length === 0 || allowedPlatforms.includes(normalizedId)) {
      sections[normalizedId] = text;
    }
  }

  if (Object.keys(sections).length === 0 && safeContent.trim()) {
    const firstPlatform = allowedPlatforms[0] || 'instagram';
    sections[firstPlatform] = safeContent.trim();
  }

  return sections;
}

/**
 * Get platform display name
 * @param platformId - Platform identifier
 * @returns Human-readable platform name
 */
export function getPlatformDisplayName(platformId: SharePlatform | string): string {
  const names: Record<string, string> = {
    instagram: 'Instagram',
    facebook: 'Facebook',
    twitter: 'Twitter/X',
    linkedin: 'LinkedIn',
    pressemitteilung: 'Pressemitteilung',
  };

  return names[platformId] || platformId;
}

/**
 * Check if a platform has a direct share URL
 * @param platformId - Platform identifier
 * @returns True if platform supports web share URLs
 */
export function hasPlatformShareUrl(platformId: SharePlatform): boolean {
  return platformId !== 'instagram' && platformId !== 'pressemitteilung';
}
