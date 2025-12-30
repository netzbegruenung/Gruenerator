/**
 * Share module constants
 * Platform configurations and mappings
 */

import type { SharePlatform, PlatformConfig } from './types';

/**
 * Platform configurations for social media sharing
 */
export const PLATFORM_CONFIGS: Record<SharePlatform, PlatformConfig> = {
  instagram: {
    id: 'instagram',
    displayName: 'Instagram',
    color: '#E4405F',
    hasShareUrl: false,
  },
  facebook: {
    id: 'facebook',
    displayName: 'Facebook',
    color: '#1877F2',
    hasShareUrl: true,
    getShareUrl: (text: string) =>
      `https://www.facebook.com/sharer/sharer.php?quote=${encodeURIComponent(text)}`,
  },
  twitter: {
    id: 'twitter',
    displayName: 'Twitter/X',
    color: '#1DA1F2',
    hasShareUrl: true,
    getShareUrl: (text: string) =>
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`,
  },
  linkedin: {
    id: 'linkedin',
    displayName: 'LinkedIn',
    color: '#0A66C2',
    hasShareUrl: true,
    getShareUrl: (text: string, url?: string) =>
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url || '')}&summary=${encodeURIComponent(text)}`,
  },
  pressemitteilung: {
    id: 'pressemitteilung',
    displayName: 'Pressemitteilung',
    color: '#6B7280',
    hasShareUrl: false,
  },
};

/**
 * Platform name aliases for text parsing
 * Used to normalize different platform names to their canonical IDs
 */
export const PLATFORM_MAPPINGS: Record<SharePlatform, string[]> = {
  instagram: ['instagram', 'insta'],
  facebook: ['facebook', 'fb'],
  twitter: ['twitter', 'x', 'mastodon', 'bsky', 'bluesky'],
  linkedin: ['linkedin'],
  pressemitteilung: ['pressemitteilung', 'presse', 'press release'],
};

/**
 * Default allowed platforms for sharing
 */
export const DEFAULT_SHARE_PLATFORMS: SharePlatform[] = [
  'instagram',
  'facebook',
  'twitter',
  'linkedin',
];

/**
 * Share limits
 */
export const SHARE_LIMITS = {
  MAX_ITEMS_PER_USER: 50,
  MAX_TITLE_LENGTH: 200,
} as const;

/**
 * Share status display names (German)
 */
export const SHARE_STATUS_LABELS = {
  processing: 'Wird verarbeitet...',
  ready: 'Bereit',
  failed: 'Fehlgeschlagen',
} as const;
