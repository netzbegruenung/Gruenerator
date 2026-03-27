import type { ReactNode } from 'react';

// =============================================================================
// Error Types
// =============================================================================

export type ErrorValue = string | Error | { message?: string } | null;

// =============================================================================
// Content Types
// =============================================================================

export type GeneratedContent =
  | string
  | { content: string; metadata?: Record<string, unknown> }
  | { sharepic?: unknown; social?: unknown; content?: string; metadata?: unknown };

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

// =============================================================================
// Content Renderer Types
// =============================================================================

export interface ContentRendererProps {
  value?: string | GeneratedContent | null;
  generatedContent?: GeneratedContent;
  useMarkdown?: boolean | null;
  componentName?: string;
  helpContent?: HelpContent | string | null;
  onEditModeToggle?: () => void;
}
