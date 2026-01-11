import type { PRAgentResult, FormattedPRResponse } from '../types.js';

/**
 * Formats strategy approval response as markdown for direct display
 * Used in Phase 1 (strategy generation) before user approval
 */
export function formatStrategyApprovalResponse(
  framing: string,
  argumentsSummary: string | null,
  argumentsList: Array<{
    source: string;
    relevance: number;
    text: string;
    metadata?: {
      collection: string;
      category?: string;
      url?: string;
    };
  }>,
  topic: string,
  metadata: {
    documentsCount?: number;
    webSourcesCount?: number;
    executionTimeMs?: number;
    argumentsFound?: number;
    enrichmentMetadata?: any;
  }
): string {
  let content = `## Strategische Positionierung\n\n${framing}`;

  // Add arguments summary if available
  if (argumentsSummary) {
    content += `\n\n---\n\n## Recherchierte Argumente – Zusammenfassung\n\n`;
    content += `*KI-gestützte Zusammenfassung der Argumente aus grünen Wissensdatenbanken:*\n\n`;
    content += `${argumentsSummary}`;
  }

  // Add argument sources (metadata only, not full text)
  if (argumentsList.length > 0) {
    content += `\n\n### Verwendete Argumente (Quellen)\n\n`;
    argumentsList.forEach((arg) => {
      // Show source title
      content += `**${arg.source}**\n`;

      // Show relevance score
      content += `- Relevanz: ${Math.round(arg.relevance * 100)}%\n`;

      // Show collection/database
      if (arg.metadata?.collection) {
        const collectionNames: Record<string, string> = {
          'grundsatz_documents': 'Grundsatzprogramm',
          'bundestag_content': 'Bundestagsfraktion',
          'kommunalwiki_documents': 'KommunalWiki',
          'gruene_de_documents': 'gruene.de',
          'gruene_at_documents': 'gruene.at'
        };
        const displayName = collectionNames[arg.metadata.collection] || arg.metadata.collection;
        content += `- Quelle: ${displayName}\n`;
      }

      // Show URL if available
      if (arg.metadata?.url) {
        content += `- Link: ${arg.metadata.url}\n`;
      }

      content += '\n';
    });
  }

  // Add metadata footer
  if (metadata.documentsCount || metadata.webSourcesCount) {
    content += `\n\n---\n\n*Recherche-Quellen: `;
    const sources = [];
    if (metadata.documentsCount) sources.push(`${metadata.documentsCount} Dokumente`);
    if (metadata.webSourcesCount) sources.push(`${metadata.webSourcesCount} Web-Quellen`);
    content += sources.join(', ') + '*';
  }

  // Add sources bibliography if available
  if (metadata.enrichmentMetadata) {
    const sourcesBiblio = formatSourcesBibliography(metadata.enrichmentMetadata);
    if (sourcesBiblio) {
      content += `\n\n---\n\n${sourcesBiblio}`;
    }
  }

  return content;
}

/**
 * Formats PR Agent result for BaseForm/DisplaySection compatibility
 * Includes examples used as inspiration
 */
export function formatPRAgentResponse(
  result: PRAgentResult & { metadata?: Record<string, any> }
): FormattedPRResponse {
  const contentSections = [
    `# Strategisches Framing\n\n${result.framing}`,
    `# Pressemitteilung\n\n${result.pressRelease}`,
    `# Instagram\n\n${result.social.instagram}`,
    `# Facebook\n\n${result.social.facebook}`,
    `# Risiko-Analyse\n\n${result.riskAnalysis}`,
    `# Visuelles Briefing\n\n${result.visualBriefing}`
  ];

  // Add sources bibliography before examples
  if (result.metadata?.enrichmentMetadata) {
    const sourcesBiblio = formatSourcesBibliography(result.metadata.enrichmentMetadata);
    if (sourcesBiblio) {
      contentSections.push(sourcesBiblio);
    }
  }

  // Add examples section (keep as-is with 300 char truncation)
  const examples = result.metadata?.examplesUsed || [];
  if (examples.length > 0) {
    const examplesSection = formatExamplesSection(examples);
    contentSections.push(examplesSection);
  }

  const content = contentSections.join('\n\n---\n\n');

  return {
    success: true,
    content,
    sharepic: result.sharepics || [],
    metadata: result.metadata || {},
    selectedPlatforms: ['instagram', 'facebook', 'pressemitteilung'],
    onEditSharepic: async () => {}
  };
}

/**
 * Formats examples into user-friendly display
 */
function formatExamplesSection(examples: any[]): string {
  let section = '# Diese Beispiele dienten als Inspiration\n\n';
  section += '*Die folgenden erfolgreichen Posts wurden als stilistische Orientierung verwendet:*\n\n';

  for (const example of examples) {
    section += `## ${example.platform || 'Social Media'} - Beispiel\n\n`;

    if (example.content) {
      const content = example.content.length > 300
        ? example.content.substring(0, 300) + '...'
        : example.content;
      section += `${content}\n\n`;
    }

    if (example.relevanceScore) {
      section += `*Relevanz: ${Math.round(example.relevanceScore * 100)}%*\n\n`;
    }
  }

  section += '*Hinweis: Die Beispiele wurden nicht kopiert, sondern dienten als Orientierung für Tonalität, Struktur und Stil.*';

  return section;
}

/**
 * Formats enrichment sources as a bibliography-style list
 * Shows all documents, texts, and web sources used
 */
export function formatSourcesBibliography(metadata: any): string {
  if (!metadata) return '';

  const sections: string[] = [];

  // Documents section
  if (metadata.documentsReferences && metadata.documentsReferences.length > 0) {
    let docSection = '### Dokumente\n\n';
    metadata.documentsReferences.forEach((doc: any, idx: number) => {
      docSection += `${idx + 1}. **${doc.title}**\n`;
      docSection += `   - Datei: ${doc.filename}\n`;
      if (doc.pageCount) {
        docSection += `   - Seiten: ${doc.pageCount}\n`;
      }
      docSection += `   - Methode: ${doc.retrievalMethod === 'full_text' ? 'Volltext' : 'Vektorsuche'}\n`;
      if (doc.relevance) {
        docSection += `   - Relevanz: ${doc.relevance}%\n`;
      }
      docSection += '\n';
    });
    sections.push(docSection);
  }

  // Saved texts section
  if (metadata.textsReferences && metadata.textsReferences.length > 0) {
    let textsSection = '### Gespeicherte Texte\n\n';
    metadata.textsReferences.forEach((text: any, idx: number) => {
      textsSection += `${idx + 1}. **${text.title}**\n`;
      textsSection += `   - Typ: ${text.type}\n`;
      if (text.wordCount) {
        textsSection += `   - Wörter: ${text.wordCount}\n`;
      }
      if (text.createdAt) {
        textsSection += `   - Erstellt: ${text.createdAt}\n`;
      }
      textsSection += '\n';
    });
    sections.push(textsSection);
  }

  // Web search sources section
  if (metadata.webSearchSources && metadata.webSearchSources.length > 0) {
    let webSection = '### Web-Quellen\n\n';
    metadata.webSearchSources.forEach((source: any, idx: number) => {
      webSection += `${idx + 1}. **${source.title}**\n`;
      webSection += `   - URL: ${source.url}\n`;
      if (source.domain) {
        webSection += `   - Domain: ${source.domain}\n`;
      }
      webSection += '\n';
    });
    sections.push(webSection);
  }

  if (sections.length === 0) return '';

  return `# Verwendete Quellen\n\n${sections.join('\n')}`;
}
