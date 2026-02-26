import { extractLocaleFromRequest } from '../../../../services/localization/index.js';
import { createLogger } from '../../../../utils/logger.js';
import { enrichRequest } from '../../../../utils/requestEnrichment.js';
import { searchArgumentsFromNotebooks } from '../../PRAgent/generators/argumentsGenerator.js';
import { summarizeArguments } from '../../PRAgent/generators/argumentsSummarizer.js';

import type { SocialAgentState } from '../types.js';

const log = createLogger('SocialAgent:research');

export async function researchNode(state: SocialAgentState): Promise<Partial<SocialAgentState>> {
  const startTime = Date.now();
  log.debug('[researchNode] Starting research for topic:', state.inhalt.substring(0, 100));

  try {
    const locale = extractLocaleFromRequest(state.req);
    const argumentCollections =
      locale === 'de-AT'
        ? ['oesterreich_gruene_documents', 'gruene_at_documents']
        : [
            'grundsatz_documents',
            'bundestag_content',
            'kommunalwiki_documents',
            'gruene_de_documents',
          ];

    // Build web search query following the standard pipeline pattern
    const partySearchTerm = locale === 'de-AT' ? 'Die Grünen Österreich' : 'Bündnis 90 Die Grünen';
    const shouldWebSearch = !state.features.usePrivacyMode && state.features.useWebSearchTool;
    const webSearchQuery = shouldWebSearch ? `${state.inhalt} ${partySearchTerm} Politik` : null;
    const aiWorkerPool = state.req?.app?.locals?.aiWorkerPool;

    log.debug(`[researchNode] Web search: ${shouldWebSearch ? 'yes' : 'no'}`);

    const [enrichedState, argumentResults] = await Promise.all([
      enrichRequest(
        {
          inhalt: state.inhalt,
          zitatgeber: state.zitatgeber || '',
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
          type: 'social',
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
      searchArgumentsFromNotebooks(state.inhalt, { limit: 8, collections: argumentCollections }),
    ]);

    let argumentsSummary: string | null = null;
    if (argumentResults.length > 0) {
      argumentsSummary = await summarizeArguments(state.inhalt, argumentResults);
    }

    // researchContext = only the party-document summary.
    // enrichedState.knowledge already carries web search results, URLs, docs, texts.
    // Downstream nodes spread both separately — no duplication.
    const researchContext = argumentsSummary
      ? `Recherchierte Argumente:\n${argumentsSummary}`
      : null;

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
