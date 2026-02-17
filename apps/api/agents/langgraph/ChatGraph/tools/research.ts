/**
 * Research Tool
 *
 * Structured multi-source research with planning, searching, and synthesis.
 * Wraps executeResearch() from directSearch for deep research queries.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

import { executeResearch } from '../../../../routes/chat/agents/directSearch.js';
import { createLogger } from '../../../../utils/logger.js';

import type { ToolDependencies } from './registry.js';

const log = createLogger('Tool:Research');

export function createResearchTool(_deps: ToolDependencies): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'research',
    description:
      'Führe eine strukturierte Recherche mit mehreren Quellen durch. ' +
      'Nutze dieses Tool für komplexe Fragen, die Informationen aus mehreren Quellen kombinieren, ' +
      'Vergleiche, detaillierte Analysen oder faktenbasierte Inhalte (Pressemitteilungen, Artikel, Reden).',
    schema: z.object({
      query: z.string().describe('Die Recherche-Frage'),
      depth: z
        .enum(['quick', 'thorough'])
        .optional()
        .describe('Recherchetiefe: "quick" (Standard) oder "thorough" für umfassendere Suche'),
    }),
    func: async ({ query, depth }) => {
      const searchDepth = depth || 'quick';
      log.info(`[Research] query="${query.slice(0, 60)}" depth=${searchDepth}`);

      const result = await executeResearch({
        question: query,
        depth: searchDepth,
        maxSources: searchDepth === 'thorough' ? 10 : 6,
        useLLMSynthesis: true,
      });

      const parts: string[] = [];

      if (result.answer) {
        parts.push(`## Zusammenfassung\n\n${result.answer}`);
      }

      if (result.citations.length > 0) {
        const citationList = result.citations
          .map((c) => `[${c.id}] ${c.title} (${c.url})\n${c.snippet}`)
          .join('\n\n');
        parts.push(`## Quellen\n\n${citationList}`);
      }

      if (result.confidence) {
        parts.push(`Konfidenz: ${result.confidence}`);
      }

      return parts.join('\n\n') || 'Keine Recherche-Ergebnisse gefunden.';
    },
  });
}
