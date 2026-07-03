// =============================================================================
// Content Types
// =============================================================================

/**
 * Structured content shape. Covers the plain content envelope, the
 * sharepic-with-optional-social payload, and the text-with-metadata
 * envelope that generators produce. Intentionally a loose structural
 * type without an index signature so it accepts discriminated-union
 * members (SharepicContent / TextContent / SocialContent / LinesContent
 * from apps/web/src/stores/chatStore.ts) without requiring them to
 * declare extra unknown keys.
 */
export interface GeneratedContentObject {
  content?: string;
  social?: { content?: string };
  sharepic?: Record<string, unknown> | unknown;
  metadata?: unknown;
}

export type GeneratedContent = string | GeneratedContentObject;

// =============================================================================
// Help Types
// =============================================================================

export interface HelpContent {
  content: string;
  tips?: string[];
  isNewFeature?: boolean;
  featureId?: string;
  fallbackContent?: string;
  fallbackTips?: string[];
  features?: unknown;
}

// =============================================================================
// Error Display Types
// =============================================================================

export interface ErrorDisplayProps {
  error?: string | null;
  onDismiss?: () => void;
}
