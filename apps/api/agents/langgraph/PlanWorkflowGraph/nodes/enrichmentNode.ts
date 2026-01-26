/**
 * Enrichment Node
 * Fetches and caches all context data needed for plan generation
 * Reusable across all generator types
 */

import type { PlanWorkflowState, EnrichmentNodeOutput } from '../types.js';
import { enrichRequest } from '../../../../utils/requestEnrichment.js';
import { searchArgumentsFromNotebooks } from '../../PRAgent/generators/argumentsGenerator.js';

/**
 * Enrichment Node: Load all context data
 * Runs once at the beginning, results are cached in state
 */
export async function enrichmentNode(state: PlanWorkflowState): Promise<EnrichmentNodeOutput> {
  const startTime = Date.now();
  console.log(`[PlanWorkflow] Starting enrichment for ${state.generatorType}`);

  try {
    const { input, promptConfig } = state;

    // Base enrichment (documents, web search, knowledge base)
    const enrichedState = await enrichRequest(input, {
      type: state.generatorType === 'pr' ? 'social' : state.generatorType,
      enableWebSearch: promptConfig.enableWebSearch && input.useWebSearch,
      enableDocQnA: promptConfig.enableDocuments && (input.selectedDocumentIds?.length || 0) > 0,
      searchQuery: input.inhalt,
      selectedDocumentIds: input.selectedDocumentIds,
      selectedTextIds: input.selectedTextIds,
      req: input.req,
    });

    // Green framing enrichment (for political generators)
    let greenFraming: string[] = [];
    if (promptConfig.enableGreenFraming) {
      try {
        const results = await searchArgumentsFromNotebooks(input.inhalt, {
          collections: ['grundsatz_documents', 'gruene_de_documents'],
          limit: 5,
          threshold: 0.4,
        });

        greenFraming = results.map(
          (r) =>
            `## ${r.source}\n**Quelle:** ${r.metadata.collection}\n**Relevanz:** ${Math.round(r.relevance * 100)}%\n\n${r.text}`
        );

        console.log(`[PlanWorkflow] Found ${greenFraming.length} green framing arguments`);
      } catch (error: any) {
        console.error('[PlanWorkflow] Green framing fetch failed:', error);
      }
    }

    const enrichmentTimeMs = Date.now() - startTime;

    return {
      enrichedState: {
        documents: enrichedState.documents || [],
        webSearchResults: enrichedState.knowledge?.filter((k: string) => k.includes('Web')) || [],
        knowledgeBase: enrichedState.knowledge?.filter((k: string) => !k.includes('Web')) || [],
        greenFraming,
        enrichmentMetadata: (enrichedState.enrichmentMetadata || {
          documentCount: enrichedState.documents?.length || 0,
          textCount: 0,
          webSearchResultCount: 0,
          knowledgeSourceCount: enrichedState.knowledge?.length || 0,
          enrichmentTimeMs: Date.now() - startTime,
          sources: [] as Array<{ type: string; title?: string; url?: string }>,
        }) as any,
      },
      enrichmentTimeMs,
      currentPhase: 'plan',
      phasesExecuted: [...state.phasesExecuted, 'enrich'],
      totalAICalls: state.totalAICalls, // No AI calls in enrichment
    };
  } catch (error: any) {
    console.error('[PlanWorkflow] Enrichment error:', error);
    return {
      error: `Enrichment failed: ${error.message}`,
      currentPhase: 'error',
      success: false,
    };
  }
}
