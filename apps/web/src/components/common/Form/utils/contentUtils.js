import React from 'react';

/**
 * Extrahiert den exportierbaren Inhalt aus verschiedenen Inhaltsformaten
 * @param {string|Object} generatedContent - Generierter Inhalt
 * @param {string} value - Aktueller Wert
 * @returns {string} Exportierbarer Inhalt
 */
export const getExportableContent = (generatedContent, value) => {
  if (generatedContent) {
    return typeof generatedContent === 'string' ? generatedContent : generatedContent?.content || '';
  }
  return value || '';
};

/**
 * Generiert CSS-Klassennamen für den Basis-Container
 * @param {Object} params - Parameter für die Klassennamen
 * @returns {string} Generierte Klassennamen
 */
export const getBaseContainerClasses = ({
  isEditing,
  title,
  generatedContent,
  isMultiPlatform,
  isFormVisible
}) => {
  const classes = [
    'base-container',
    isEditing ? 'editing-mode' : '',
    title === "Grünerator Antragscheck" ? 'antragsversteher-base' : '',
    generatedContent && (
      typeof generatedContent === 'string' ? generatedContent.length > 0 : generatedContent?.content?.length > 0
    ) ? 'has-generated-content' : '',
    isMultiPlatform ? 'multi-platform' : '',
    !isFormVisible ? 'form-hidden' : ''
  ];

  return classes.filter(Boolean).join(' ');
};

/**
 * Detects if content is markdown by checking for common markdown patterns
 * @param {string} content - Content to check
 * @returns {boolean} True if content appears to be markdown
 */
export const isMarkdownContent = (content) => {
  if (!content || typeof content !== 'string') return false;
  
  // Check for common markdown patterns
  const markdownPatterns = [
    /^#{1,6}\s+/m,           // Headers (# ## ###)
    /\*\*.*?\*\*/,           // Bold text
    /\*.*?\*/,               // Italic text (but not bold)
    /^\s*[-*+]\s+/m,         // Unordered lists
    /^\s*\d+\.\s+/m,         // Ordered lists
    /^>\s+/m,                // Blockquotes
    /`.*?`/,                 // Inline code
    /^\s*```/m,              // Code blocks
    /\[.*?\]\(.*?\)/,        // Links
  ];
  
  // Content is likely markdown if it contains multiple markdown patterns
  // or if it has headers (which are strong indicators)
  const patternMatches = markdownPatterns.filter(pattern => pattern.test(content)).length;
  const hasHeaders = /^#{1,6}\s+/m.test(content);
  
  return hasHeaders || patternMatches >= 2;
};

/**
 * Prüft, ob der Inhalt ein React-Element ist
 * @param {any} content - Zu prüfender Inhalt
 * @returns {boolean} True, wenn der Inhalt ein React-Element ist
 */
export const isReactElement = (content) => {
  return React.isValidElement(content);
};

/**
 * Entfernt GRUEN_TITLE Tags aus dem Inhalt (Frontend-Fallback)
 * @param {string} content - Text zu bereinigen
 * @returns {string} Text ohne GRUEN_TITLE Tags
 */
export const removeGruenTitleTags = (content) => {
  if (!content || typeof content !== 'string') return content;
  
  // Remove GRUEN_TITLE tags that should have been processed by backend
  return content.replace(/<GRUEN_TITLE>.*?<\/GRUEN_TITLE>/gs, '').trim();
};

/**
 * Entfernt eine umschließende Code-Fence (```...```) falls der gesamte Inhalt
 * innerhalb einer einzigen Fence liegt. Bewahrt inneren Text (Markdown) für normales Rendering.
 * @param {string} content - Eingabetext
 * @returns {string} Inhalt ohne äußere Code-Fence
 */
export const stripWrappingCodeFence = (content) => {
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
 * @param {string} content - Text zu normalisieren
 * @returns {string} Text mit normalisierten Zeilenumbrüchen
 */
export const normalizeLineBreaks = (content) => {
  if (!content || typeof content !== 'string') return content;
  
  // Detect if content is HTML
  const isHtml = /<[^>]+>/.test(content);
  
  if (isHtml) {
    // For HTML: Remove newlines between tags to prevent double spacing
    return content
      .replace(/>\s*\n+\s*</g, '><')  // Remove all newlines between tags
      .replace(/(<\/p>|<\/div>|<\/h\d>)\s*\n+/gi, '$1') // Remove newlines after block elements
      .trim();
  } else {
    // For plain text/markdown: Current normalization
    return content
      .replace(/\n{3,}/g, '\n\n')  // Mehr als 2 Zeilenumbrüche -> 2
      .replace(/\r\n{3,}/g, '\r\n\r\n')  // Windows Zeilenumbrüche
      .replace(/(\r?\n\s*){3,}/g, '\n\n'); // Zeilenumbrüche mit Whitespace
  }
}; 
