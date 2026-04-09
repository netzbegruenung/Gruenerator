/**
 * Search Examples Tool
 *
 * Searches social media examples and templates.
 * Wraps executeDirectExamplesSearch() from directSearch.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

import { executeDirectExamplesSearch } from '../../../../routes/chat/agents/directSearch.js';
import { createLogger } from '../../../../utils/logger.js';

import type { ToolDependencies } from './registry.js';

const log = createLogger('Tool:SearchExamples');

export function createSearchExamplesTool(deps: ToolDependencies): DynamicStructuredTool {
    // @ts-expect-error - Zod schema type compatibility with LangChain ToolInputSchemaBase
  return new DynamicStructuredTool({
    name: 'search_examples',
    description:
      'Suche Social-Media-Beispiele und Vorlagen (Facebook, Instagram). ' +
      'Nutze dieses Tool wenn der Nutzer nach Beispiel-Posts, Vorlagen oder Inspirationen fragt.',
    schema: z.object({
      query: z.string().describe('Die Suchanfrage für Beispiele'),
      platform: z
        .enum(['facebook', 'instagram'])
        .optional()
        .describe('Optionale Plattform-Filterung'),
    }).describe('Beispielsuche'),
    func: async (input: { query: string; platform?: string }) => {
      const { query, platform } = input;
      const country =
        deps.agentConfig.toolRestrictions?.examplesCountry ||
        (deps.userLocale === 'de-AT' ? 'AT' : undefined);
      log.info(`[SearchExamples] query="${query.slice(0, 60)}" platform=${platform || 'all'}`);

      const params: Parameters<typeof executeDirectExamplesSearch>[0] = {
        query,
      };
      if (platform != null) {
        params.platform = platform;
      }
      if (country != null) {
        params.country = country;
      }
      const result = await executeDirectExamplesSearch(params);

      if (!result.examples || result.examples.length === 0) {
        return 'Keine Social-Media-Beispiele gefunden.';
      }

      const formatted = result.examples
        .slice(0, 5)
        .map((e, i) => {
          const meta = [e.platform, e.author].filter(Boolean).join(' · ');
          return `[${i + 1}] ${meta}\n${e.content}`;
        })
        .join('\n\n---\n\n');

      return `${result.examples.length} Beispiele gefunden:\n\n${formatted}`;
    },
  });
}
