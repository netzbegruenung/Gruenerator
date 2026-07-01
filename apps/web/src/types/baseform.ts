import type { ReactNode } from 'react';

// =============================================================================
// Error Types
// =============================================================================

export type ErrorValue = string | Error | { message?: string } | null;

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

export interface ContentMetadata {
  title?: string;
  titleSource?: 'extracted' | 'smart' | 'ai';
  contentType?: string;
  citations?: unknown[];
  enrichmentSummary?: Record<string, unknown>;
}

// =============================================================================
// Help & Export Types
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

export interface CustomExportOption {
  id: string;
  label: string;
  subtitle?: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

// =============================================================================
// Error Display Types
// =============================================================================

export interface ErrorDisplayProps {
  error?: string | null;
  onDismiss?: () => void;
}
