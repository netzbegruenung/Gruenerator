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
    if (aliases.some(alias => name.includes(alias))) {
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

  const sections: PlatformSections = {};

  // Match platform headers like "## Instagram" or "## Twitter/X"
  const platformRegex = /##\s*(Instagram|Facebook|Twitter|LinkedIn|Pressemitteilung|X,?\s*Mastodon|Bsky|Bluesky)[^\n]*\n([\s\S]*?)(?=##\s|$)/gi;

  let match;
  while ((match = platformRegex.exec(content)) !== null) {
    const platformName = match[1];
    const text = match[2].trim();
    const normalizedId = normalizePlatformId(platformName) as SharePlatform;

    // Only include if allowed (or if no filter specified)
    if (allowedPlatforms.length === 0 || allowedPlatforms.includes(normalizedId)) {
      sections[normalizedId] = text;
    }
  }

  // If no sections found but content exists, use entire content for first allowed platform
  if (Object.keys(sections).length === 0 && content.trim()) {
    const firstPlatform = allowedPlatforms[0] || 'instagram';
    sections[firstPlatform] = content.trim();
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
