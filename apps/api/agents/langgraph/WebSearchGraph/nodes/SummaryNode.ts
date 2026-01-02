/**
 * Summary Node for WebSearchGraph
 * Generates AI summary using enriched results (normal mode only)
 */

import type { WebSearchState, Citation } from '../types.js';
import { extractKeyParagraphs } from '../utilities/contentExtractor.js';
import { validateAndInjectCitations } from '../../../../services/search/index.js';

/**
 * Intelligent Summary Node: Generate AI summary with citations
 */
export async function summaryNode(state: WebSearchState): Promise<Partial<WebSearchState>> {
  if (state.mode !== 'normal') {
    return { summary: undefined };
  }

  console.log('[WebSearchGraph] Generating intelligent summary with enriched results');

  try {
    // Use enriched results if available, otherwise fall back to original web results
    let resultsToUse = state.enrichedResults;
    if (!resultsToUse || resultsToUse.length === 0) {
      const firstWebSearch = state.webResults?.[0];
      resultsToUse = firstWebSearch?.results || [];
    }

    if (resultsToUse.length === 0) {
      return {
        summary: 'Keine Suchergebnisse zum Zusammenfassen verfügbar.'
      };
    }

    console.log(`[IntelligentSummary] Processing ${resultsToUse.length} results`);

    // Separate full content from snippets
    const fullContentResults = resultsToUse.filter(r => r.crawled && r.fullContent);
    const snippetResults = resultsToUse.filter(r => !r.crawled || !r.fullContent);

    // Build hierarchical references - prioritize full content
    const references: any[] = [];
    let refIndex = 1;

    // Primary sources (full content) - extract key paragraphs
    for (const result of fullContentResults.slice(0, 3)) {
      const keyContent = extractKeyParagraphs(result.fullContent || result.content, state.query, 400);
      references.push({
        id: refIndex++,
        title: result.title,
        content: keyContent,
        type: 'primary',
        source: result.url
      });
    }

    // Supplementary sources (snippets) - up to 5 more
    for (const result of snippetResults.slice(0, 5)) {
      references.push({
        id: refIndex++,
        title: result.title,
        content: result.snippet || result.content || 'No preview available',
        type: 'supplementary',
        source: result.url
      });
    }

    if (references.length === 0) {
      return {
        summary: 'Keine verwertbaren Inhalte zum Zusammenfassen gefunden.'
      };
    }

    // Build references summary for AI
    const referencesText = references.map(r => {
      const typeLabel = r.type === 'primary' ? '(VOLLTEXT)' : '(Snippet)';
      return `[${r.id}] ${r.title} ${typeLabel}: ${r.content.slice(0, 300)}`;
    }).join('\n\n');

    // Enhanced system prompt
    const systemPrompt = `Du bist ein Experte für intelligente Web-Zusammenfassungen. Du erhältst sowohl Volltext-Quellen als auch Snippets.

HIERARCHIE:
- VOLLTEXT-Quellen [1-${fullContentResults.length}]: Primärquellen mit vollständigem Inhalt
- Snippet-Quellen [${fullContentResults.length + 1}-${references.length}]: Ergänzende Kurzzusammenfassungen

ANWEISUNGEN:
- MAX. 800 Zeichen (ca. 3-4 Sätze)
- PRIORISIERE Volltext-Quellen für Zitationen
- Verwende [1], [2], [3] für alle wichtigen Aussagen
- NIEMALS "Quelle:", "laut", "nach" - NUR [1], [2], [3]
- Zusammenhängende Absätze, keine Listen

BEISPIEL: "Kommunaler Klimaschutz zeigt konkrete Erfolge [1]. Pop-up-Radwege werden dauerhaft übernommen [2]. Freiburg dient als Vorbild für andere Städte [3]."`;

    const userPrompt = `Erstelle eine präzise Zusammenfassung zu: "${state.query}"

MAX. 800 Zeichen! Fokussiere auf die wichtigsten Erkenntnisse mit [1], [2], [3] Zitationen.

Verfügbare Quellen (VOLLTEXT-Quellen bevorzugen):
${referencesText}

Crawl-Statistik: ${state.crawlMetadata?.crawledUrls || 0} erfolgreich gecrawlt`;

    const result = await state.aiWorkerPool.processRequest({
      type: 'web_search_summary',
      systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      options: {
        provider: 'litellm',
        model: 'gpt-oss:120b',
        max_tokens: 500,
        temperature: 0.2
      }
    }, state.req);

    if (!result.success) {
      throw new Error(result.error);
    }

    // Build references map for citation validation
    const referencesMap: Record<string, any> = {};
    references.forEach(ref => {
      referencesMap[String(ref.id)] = {
        title: ref.title,
        snippets: [[ref.content]],
        description: null,
        date: new Date().toISOString(),
        source: ref.type === 'primary' ? 'full_content' : 'web_snippet',
        url: ref.source,
        source_type: 'web',
        similarity_score: 1.0,
        chunk_index: 0
      };
    });

    // Process the AI response for citations
    const { cleanDraft, citations, sources, errors } = validateAndInjectCitations(
      result.content,
      referencesMap
    );

    // Log citation validation errors if any
    if (errors && errors.length > 0) {
      console.warn('[WebSearchGraph] Intelligent summary citation validation errors:', errors);
    }

    return {
      summary: cleanDraft,
      referencesMap,
      citations,
      citationSources: sources,
      metadata: {
        ...state.metadata,
        summaryGenerated: true,
        citationsCount: citations?.length || 0,
        sourcesCount: sources?.length || 0,
        citationErrors: errors?.length || 0
      }
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[WebSearchGraph] Intelligent summary generation error:', errorMessage);
    return {
      summary: 'Fehler beim Generieren der intelligenten Zusammenfassung.'
    };
  }
}
