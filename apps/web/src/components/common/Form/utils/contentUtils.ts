import React, { type ReactNode } from 'react';

interface GeneratedContentObject {
  content?: string;
}

type GeneratedContent = string | GeneratedContentObject | null | undefined;

/**
 * Extrahiert den exportierbaren Inhalt aus verschiedenen Inhaltsformaten
 */
export const getExportableContent = (generatedContent: GeneratedContent, value: string): string => {
  if (generatedContent) {
    return typeof generatedContent === 'string'
      ? generatedContent
      : generatedContent?.content || '';
  }
  return value || '';
};

interface BaseContainerParams {
  isEditing: boolean;
  title?: string;
  generatedContent: GeneratedContent;
  isMultiPlatform: boolean;
  isFormVisible: boolean;
}

/**
 * Generiert CSS-Klassennamen für den Basis-Container
 */
export const getBaseContainerClasses = ({
  isEditing,
  title,
  generatedContent,
  isMultiPlatform,
  isFormVisible,
}: BaseContainerParams): string => {
  const classes = [
    'base-container',
    isEditing ? 'editing-mode' : '',
    generatedContent &&
    (typeof generatedContent === 'string'
      ? generatedContent.length > 0
      : generatedContent?.content?.length && generatedContent.content.length > 0)
      ? 'has-generated-content'
      : '',
    isMultiPlatform ? 'multi-platform' : '',
    !isFormVisible ? 'form-hidden' : '',
  ];

  return classes.filter(Boolean).join(' ');
};

/**
 * Detects if content is markdown by checking for common markdown patterns
 */
export const isMarkdownContent = (content: string | null | undefined): boolean => {
  if (!content || typeof content !== 'string') return false;

  // Check for common markdown patterns
  const markdownPatterns = [
    /^#{1,6}\s+/m, // Headers (# ## ###)
    /\*\*.*?\*\*/, // Bold text
    /\*.*?\*/, // Italic text (but not bold)
    /^\s*[-*+]\s+/m, // Unordered lists
    /^\s*\d+\.\s+/m, // Ordered lists
    /^>\s+/m, // Blockquotes
    /`.*?`/, // Inline code
    /^\s*```/m, // Code blocks
    /\[.*?\]\(.*?\)/, // Links
  ];

  // Content is likely markdown if it contains multiple markdown patterns
  // or if it has headers (which are strong indicators)
  const patternMatches = markdownPatterns.filter((pattern) => pattern.test(content)).length;
  const hasHeaders = /^#{1,6}\s+/m.test(content);

  return hasHeaders || patternMatches >= 2;
};

/**
 * Prüft, ob der Inhalt ein React-Element ist
 */
export const isReactElement = (content: unknown): content is React.ReactElement => {
  return React.isValidElement(content);
};

/**
 * Entfernt GRUEN_TITLE Tags aus dem Inhalt (Frontend-Fallback)
 */
export const removeGruenTitleTags = (content: string | null | undefined): string | null | undefined => {
  if (!content || typeof content !== 'string') return content;

  // Remove GRUEN_TITLE tags that should have been processed by backend
  return content.replace(/<GRUEN_TITLE>.*?<\/GRUEN_TITLE>/gs, '').trim();
};

/**
 * Entfernt eine umschließende Code-Fence (```...```) falls der gesamte Inhalt
 * innerhalb einer einzigen Fence liegt. Bewahrt inneren Text (Markdown) für normales Rendering.
 */
export const stripWrappingCodeFence = (content: string | null | undefined): string | null | undefined => {
  if (!content || typeof content !== 'string') return content;

  // Normalize leading/trailing whitespace to avoid false negatives
  const trimmed = content.trim();

  // Match a single full-width fenced block using ``` or ~~~ with optional language
  const fencePattern = /^(?:```|~~~)([a-zA-Z0-9_-]+)?\s*\n([\s\S]*?)\n(?:```|~~~)\s*$/;
  const match = trimmed.match(fencePattern);
  if (match) {
    return match[2].trim();
  }
  return content;
};

/**
 * Normalisiert überschüssige Zeilenumbrüche im Text
 */
export const normalizeLineBreaks = (content: string | null | undefined): string | null | undefined => {
  if (!content || typeof content !== 'string') return content;

  // If content looks like Markdown, skip HTML normalization entirely —
  // Markdown headers or bold/italic are strong indicators
  const looksLikeMarkdown = /^#{1,6}\s+/m.test(content) || /\*\*.*?\*\*/.test(content);

  // Only treat as HTML if it contains actual HTML block tags (not just any angle bracket)
  const isHtml =
    !looksLikeMarkdown &&
    /<\/?(div|p|span|h[1-6]|ul|ol|li|table|tr|td|th|br|hr|section|article|header|footer|nav|main|blockquote|pre|code|img|a|strong|em|b|i)\b[^>]*>/i.test(
      content
    );

  if (isHtml) {
    // For HTML: Remove newlines between tags to prevent double spacing
    return content
      .replace(/>\s*\n+\s*</g, '><') // Remove all newlines between tags
      .replace(/(<\/p>|<\/div>|<\/h\d>)\s*\n+/gi, '$1') // Remove newlines after block elements
      .trim();
  } else {
    // For plain text/markdown: Current normalization
    return content
      .replace(/\n{3,}/g, '\n\n') // Mehr als 2 Zeilenumbrüche -> 2
      .replace(/\r\n{3,}/g, '\r\n\r\n') // Windows Zeilenumbrüche
      .replace(/(\r?\n\s*){3,}/g, '\n\n'); // Zeilenumbrüche mit Whitespace
  }
};
