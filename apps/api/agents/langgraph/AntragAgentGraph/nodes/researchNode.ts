import { extractLocaleFromRequest } from '../../../../services/localization/index.js';
import { createLogger } from '../../../../utils/logger.js';
import { enrichRequest } from '../../../../utils/requestEnrichment.js';
import mistralClient from '../../../../workers/mistralClient.js';
import { searchArgumentsFromNotebooks } from '../../PRAgent/generators/argumentsGenerator.js';

import type { ArgumentResult } from '../../PRAgent/generators/argumentsGenerator.js';
import type { AntragAgentState, AntragRequestType } from '../types.js';

const log = createLogger('AntragAgent:research');

export async function researchNode(state: AntragAgentState): Promise<Partial<AntragAgentState>> {
  const startTime = Date.now();
  log.debug('[researchNode] Starting research for topic:', state.inhalt.substring(0, 100));

  try {
    const locale = extractLocaleFromRequest(state.req);
    const argumentCollections =
      locale === 'de-AT'
        ? ['oesterreich_gruene_documents', 'gruene_at_documents']
        : [
            'kommunalwiki_documents',
            'grundsatz_documents',
            'bundestag_content',
            'gruene_de_documents',
          ];

    // Build web search query following the standard pipeline pattern (antrag_simple.json template)
    const partySearchTerm = locale === 'de-AT' ? 'Die Grünen Österreich' : 'Bündnis 90 Die Grünen';
    const shouldWebSearch = !state.features.usePrivacyMode && state.features.useWebSearchTool;
    const webSearchQuery = shouldWebSearch ? `${state.inhalt} ${partySearchTerm} Politik` : null;
    const aiWorkerPool = state.req?.app?.locals?.aiWorkerPool;

    log.debug(`[researchNode] Web search: ${shouldWebSearch ? 'yes' : 'no'}`);

    const [enrichedState, argumentResults] = await Promise.all([
      enrichRequest(
        {
          inhalt: state.inhalt,
          gliederung: state.gliederung || '',
          attachments: state.attachments,
          useWebSearchTool: state.features.useWebSearchTool,
          usePrivacyMode: state.features.usePrivacyMode,
          useProMode: state.features.useProMode,
          useUltraMode: state.features.useUltraMode,
          selectedDocumentIds: state.selectedDocumentIds,
          selectedTextIds: state.selectedTextIds,
          searchQuery: state.searchQuery,
        },
        {
          type: 'antrag',
          enableUrls: !state.features.usePrivacyMode,
          enableWebSearch: shouldWebSearch,
          webSearchQuery,
          aiWorkerPool,
          usePrivacyMode: state.features.usePrivacyMode,
          selectedDocumentIds: state.selectedDocumentIds,
          selectedTextIds: state.selectedTextIds,
          searchQuery: state.searchQuery,
        },
        state.req
      ),
      searchArgumentsFromNotebooks(state.inhalt, { limit: 10, collections: argumentCollections }),
    ]);

    let argumentsSummary: string | null = null;
    if (argumentResults.length > 0) {
      argumentsSummary = await summarizeForAntrag(state.inhalt, state.requestType, argumentResults);
    }

    // researchContext = only the party-document summary.
    // enrichedState.knowledge already carries web search results, URLs, docs, texts.
    // Downstream nodes (strategize, generate) spread both separately — no duplication.
    const researchContext = argumentsSummary || null;

    const researchTimeMs = Date.now() - startTime;
    log.debug(
      `[researchNode] Research completed in ${researchTimeMs}ms. ` +
        `Enrichment: ${enrichedState.knowledge.length} knowledge items, ` +
        `Arguments: ${argumentResults.length}`
    );

    return {
      enrichedState,
      arguments: argumentResults,
      argumentsSummary,
      researchContext,
      researchTimeMs,
    };
  } catch (error) {
    log.error('[researchNode] Research failed:', error);
    return {
      enrichedState: null,
      arguments: [],
      argumentsSummary: null,
      researchContext: null,
      researchTimeMs: Date.now() - startTime,
      error: `Recherche fehlgeschlagen: ${(error as Error).message}`,
    };
  }
}

const REQUEST_TYPE_LABELS: Record<AntragRequestType, string> = {
  antrag: 'einen kommunalpolitischen Antrag',
  kleine_anfrage: 'eine Kleine Anfrage',
  grosse_anfrage: 'eine Große Anfrage',
};

async function summarizeForAntrag(
  topic: string,
  requestType: AntragRequestType,
  argumentsList: ArgumentResult[]
): Promise<string> {
  if (!argumentsList || argumentsList.length === 0) {
    return 'Keine relevanten Hintergrundinformationen gefunden.';
  }

  const argumentsText = argumentsList
    .map(
      (arg, idx) =>
        `${idx + 1}. **${arg.source}** (Relevanz: ${Math.round(arg.relevance * 100)}%)\n   ${arg.text}`
    )
    .join('\n\n');

  const requestTypeLabel = REQUEST_TYPE_LABELS[requestType] || 'ein politisches Dokument';

  const prompt = `Du bist ein kommunalpolitischer Recherche-Assistent für die Grünen.

**Aufgabe**: Fasse die folgenden Rechercheergebnisse aus grünen Wissensdatenbanken zu einem sachlichen Hintergrundbriefing zusammen. Das Briefing dient als Grundlage für ${requestTypeLabel}.

**Thema**: ${topic}

**Rechercheergebnisse**:

${argumentsText}

**Deine Antwort**:
Erstelle eine sachliche, faktenorientierte Zusammenfassung mit den folgenden drei Abschnitten. Schreibe zu **jedem** Abschnitt mindestens 2-3 Sätze. Wenn die Rechercheergebnisse zu einem Abschnitt keine spezifischen Informationen liefern, formuliere den Abschnitt als offene Frage oder benenne konkret, welche Informationen noch recherchiert werden müssten.

- **Politische Positionen**: Welche Positionen vertreten die Grünen zu diesem Thema laut Programmatik?
- **Fakten & Hintergrund**: Relevante Zahlen, Studien, Beispiele aus anderen Kommunen/Ländern
- **Rechtlicher Rahmen**: Welche gesetzlichen Grundlagen oder Regelungen sind relevant?

Halte die Zusammenfassung sachlich und faktenorientiert (max. 400 Wörter). Keine Kommunikationstipps, keine Formulierungsvorschläge.`;

  try {
    const response = await mistralClient.chat.complete({
      model: 'mistral-small-latest',
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 800,
      temperature: 0.2,
    });

    const content = response.choices?.[0]?.message?.content;
    const summary = typeof content === 'string' ? content.trim() : '';

    // If the LLM returned nearly empty content (just headers without substance),
    // fall back to a formatted excerpt list so the user still sees useful data
    if (summary.length < 100) {
      return buildExcerptFallback(argumentsList);
    }

    return summary || buildExcerptFallback(argumentsList);
  } catch (error) {
    log.error('[summarizeForAntrag] Failed to generate summary:', error);
    return buildExcerptFallback(argumentsList);
  }
}

function buildExcerptFallback(argumentsList: ArgumentResult[]): string {
  const excerpts = argumentsList
    .slice(0, 6)
    .map((arg, idx) => {
      const excerpt = arg.text?.trim()
        ? arg.text.length > 200
          ? arg.text.substring(0, 200) + '...'
          : arg.text
        : '*(Kein Textauszug)*';
      return `${idx + 1}. **${arg.source}** (Relevanz: ${Math.round(arg.relevance * 100)}%)\n   ${excerpt}`;
    })
    .join('\n\n');

  return (
    `**Rechercheergebnisse (${argumentsList.length} Quellen)**\n\n` +
    `Die folgenden Auszüge aus grünen Wissensdatenbanken sind relevant:\n\n${excerpts}`
  );
}
