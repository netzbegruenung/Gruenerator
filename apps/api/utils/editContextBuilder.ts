/**
 * Edit Context Builder Utility
 *
 * Builds concise context summaries for edit requests based on original generation context.
 * Keeps token usage under 500 tokens while preserving essential information.
 */

export interface EditGenerationContext {
  enrichedState?: {
    type?: string;
    platforms?: string[];
    theme?: string;
    urlsScraped?: string[];
    documentsUsed?: Array<{ title?: string; [key: string]: any }>;
    docQnAUsed?: boolean;
    vectorSearchUsed?: boolean;
    webSearchUsed?: boolean;
  };
  prompt?: string;
  type?: string;
  timestamp?: string;
  [key: string]: unknown;
}

/**
 * Build a concise context summary for edit requests
 */
export function buildEditContextSummary(generationContext: EditGenerationContext | null): string {
  if (!generationContext?.enrichedState) {
    return '';
  }

  const ctx = generationContext.enrichedState;
  const parts: string[] = [];

  parts.push('KONTEXT DER URSPRÜNGLICHEN GENERIERUNG:');
  parts.push(`- Typ: ${ctx.type || 'Unbekannt'}`);

  if (ctx.platforms && Array.isArray(ctx.platforms) && ctx.platforms.length > 0) {
    parts.push(`- Plattformen: ${ctx.platforms.join(', ')}`);
  }

  if (ctx.theme) {
    const themePreview = ctx.theme.length > 80 ? ctx.theme.substring(0, 80) + '...' : ctx.theme;
    parts.push(`- Thema: ${themePreview}`);
  }

  const sourceParts: string[] = [];
  if (ctx.urlsScraped && Array.isArray(ctx.urlsScraped) && ctx.urlsScraped.length > 0) {
    sourceParts.push(`${ctx.urlsScraped.length} URL(s) gescraped`);
  }
  if (ctx.documentsUsed && Array.isArray(ctx.documentsUsed) && ctx.documentsUsed.length > 0) {
    const docTitles = ctx.documentsUsed
      .map((d) => d.title || 'Dokument')
      .slice(0, 3)
      .join(', ');
    sourceParts.push(
      `${ctx.documentsUsed.length} Dokument(e): ${docTitles}${ctx.documentsUsed.length > 3 ? '...' : ''}`
    );
  }

  if (sourceParts.length > 0) {
    parts.push(`- Quellen: ${sourceParts.join(', ')}`);
  }

  const features: string[] = [];
  if (ctx.docQnAUsed) {
    features.push('Dokumentenanalyse');
  }
  if (ctx.vectorSearchUsed) {
    features.push('Wissensdatenbank-Suche');
  }
  if (ctx.webSearchUsed) {
    features.push('Web-Suche');
  }

  if (features.length > 0) {
    parts.push(`- Verwendete Features: ${features.join(', ')}`);
  }

  return parts.join('\n') + '\n\n';
}

/**
 * Validate generation context structure
 */
export function isValidGenerationContext(
  generationContext: any
): generationContext is EditGenerationContext {
  return (
    generationContext &&
    typeof generationContext === 'object' &&
    generationContext.enrichedState &&
    typeof generationContext.enrichedState === 'object'
  );
}
