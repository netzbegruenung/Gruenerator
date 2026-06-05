import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

import { lookupUmfragen } from '../../../../services/monitor/UmfragenService.js';
import { createLogger } from '../../../../utils/logger.js';

import type { ToolDependencies } from './registry.js';

const log = createLogger('Tool:Umfragen');

export function createLookupUmfragenTool(_deps: ToolDependencies): DynamicStructuredTool {
  // @ts-expect-error - Zod schema type compatibility with LangChain ToolInputSchemaBase
  return new DynamicStructuredTool({
    name: 'lookup_umfragen',
    description:
      'Suche nach Meinungsumfragen in Deutschland. Liefert zweierlei: ' +
      '(1) die Sonntagsfrage / Parteienumfragen (wer würde welche Partei wählen) — ' +
      'bundesweit oder für ein Bundesland, und ' +
      '(2) das Meinungsbild zu politischen Themen (MRP-Schätzung der Zustimmung, z.B. ' +
      'Verkehrspolitik, Tempolimit, Klimaschutz, Zuwanderung, Bürgergeld). ' +
      'Nutze dieses Tool bei Fragen wie "Umfragen zur Verkehrspolitik", "Sonntagsfrage Bayern", ' +
      '"wie steht die AfD in Sachsen", "was denken die Leute zu Tempolimit".',
    schema: z
      .object({
        topic: z
          .string()
          .describe(
            'Das Thema der Umfrage, z.B. "Verkehrspolitik", "Tempolimit", "Klimaschutz". ' +
              'Bei reinen Parteien-/Sonntagsfragen leer lassen oder "Sonntagsfrage".'
          ),
        bundesland: z
          .string()
          .optional()
          .describe('Optional: Bundesland für regionale Umfragen, z.B. "Bayern", "Sachsen".'),
      })
      .describe('Umfragen Lookup'),
    func: async (input: { topic: string; bundesland?: string }) => {
      const { topic, bundesland } = input;
      log.info(`[Umfragen] Lookup: "${topic}"${bundesland ? ` (${bundesland})` : ''}`);

      const result = await lookupUmfragen(topic, bundesland);
      if (!result) {
        return 'Keine Umfragedaten zu dieser Anfrage gefunden. Verfügbar sind die Sonntagsfrage (bundesweit & je Bundesland) sowie das Meinungsbild zu politischen Themen wie Verkehr, Klima, Zuwanderung, Bürgergeld.';
      }

      return result;
    },
  });
}
