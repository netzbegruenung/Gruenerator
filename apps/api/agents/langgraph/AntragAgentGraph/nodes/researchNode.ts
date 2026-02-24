import { extractLocaleFromRequest } from '../../../../services/localization/index.js';
import { createLogger } from '../../../../utils/logger.js';
import { enrichRequest } from '../../../../utils/requestEnrichment.js';
import { searchArgumentsFromNotebooks } from '../../PRAgent/generators/argumentsGenerator.js';
import { summarizeArguments } from '../../PRAgent/generators/argumentsSummarizer.js';

import type { AntragAgentState } from '../types.js';

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
          enableWebSearch: !state.features.usePrivacyMode,
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
      argumentsSummary = await summarizeArguments(state.inhalt, argumentResults);
    }

    const researchParts: string[] = [];
    if (enrichedState.knowledge.length > 0) {
      researchParts.push(enrichedState.knowledge.join('\n\n'));
    }
    if (argumentsSummary) {
      researchParts.push(`Recherchierte Argumente:\n${argumentsSummary}`);
    }

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
      researchContext: researchParts.join('\n\n---\n\n') || null,
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
