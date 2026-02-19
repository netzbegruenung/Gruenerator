/**
 * Planner Node for WebSearchGraph
 * Generates search queries based on mode (normal vs deep research)
 */

import { optimizeSearchQuery, generateResearchQuestions } from '../utilities/queryOptimizer.js';

import type { WebSearchState } from '../types.js';

/**
 * Planner Node: Generate search queries based on mode
 */
export async function plannerNode(state: WebSearchState): Promise<Partial<WebSearchState>> {
  console.log(`[WebSearchGraph] Planning ${state.mode} search for: "${state.query}"`);

  try {
    if (state.mode === 'normal') {
      // Normal mode: use original query, optionally with optimization
      const optimizedQuery = optimizeSearchQuery(state.query);
      return {
        subqueries: [optimizedQuery],
        metadata: {
          ...state.metadata,
          planningStrategy: 'normal_mode',
          queryOptimization: optimizedQuery !== state.query,
        },
      };
    } else if (state.mode === 'deep') {
      // Deep mode: generate strategic research questions using AI
      const subqueries = await generateResearchQuestions(
        state.query,
        state.aiWorkerPool,
        state.req
      );
      return {
        subqueries,
        metadata: {
          ...state.metadata,
          planningStrategy: 'deep_research',
          generatedQuestions: subqueries.length,
        },
      };
    } else {
      throw new Error(`Unknown search mode: ${state.mode}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[WebSearchGraph] Planner error:', errorMessage);
    return {
      subqueries: [state.query], // Fallback to original query
      error: `Planning failed: ${errorMessage}`,
      metadata: { ...state.metadata, planningStrategy: 'fallback' },
    };
  }
}
