import { SOCIAL_PLATFORM_INFO, type SocialPostPayload } from '@gruenerator/contracts';

/**
 * Everything the social-post card decides before it renders anything, split out
 * for the same reason as `bahnCardView`: the parts that can be wrong are the
 * character budget, the hashtag split and the collapse threshold, and none of
 * them needs a renderer to check.
 *
 * Mirrors web's `SocialPostCard`; keep the two in step.
 */

/** Longer posts collapse behind "Mehr anzeigen". */
export const COLLAPSE_THRESHOLD = 600;

/** Lines shown while collapsed — web clamps to 10. */
export const COLLAPSED_LINES = 10;

/** How-to guide for social posts — the card itself only appears in old threads. */
export const SOCIAL_POST_DOC_URL =
  'https://doku.gruenerator.eu/docs/guides/einsteigerinnen/social-media-beitrag';

export interface PostSegment {
  text: string;
  isHashtag: boolean;
}

/**
 * Split post text so hashtags can be emphasised. Unicode-aware: German
 * umlauts and digits belong to the tag, punctuation ends it.
 */
export function splitPostText(text: string): PostSegment[] {
  return text
    .split(/(#[\p{L}\p{N}_]+)/gu)
    .filter((part) => part !== '')
    .map((part) => ({ text: part, isHashtag: part.startsWith('#') }));
}

export interface SocialPostView {
  /** "Instagram-Post", or "Social Media-Post" for the generic platform. */
  title: string;
  /** Platform label, for the over-limit hint. */
  platformLabel: string;
  charCount: number;
  maxChars: number;
  overLimit: boolean;
  /** Only shown once a chat edit has bumped it past 1. */
  version: number | null;
  segments: PostSegment[];
  isCollapsible: boolean;
}

export function buildSocialPostView(post: SocialPostPayload): SocialPostView {
  const info = SOCIAL_PLATFORM_INFO[post.platform] ?? SOCIAL_PLATFORM_INFO.generic;
  return {
    title: post.platform === 'generic' ? 'Social Media-Post' : `${info.label}-Post`,
    platformLabel: info.label,
    charCount: post.charCount,
    maxChars: info.maxChars,
    overLimit: post.charCount > info.maxChars,
    version: post.version > 1 ? post.version : null,
    segments: splitPostText(post.text),
    isCollapsible: post.text.length > COLLAPSE_THRESHOLD,
  };
}
