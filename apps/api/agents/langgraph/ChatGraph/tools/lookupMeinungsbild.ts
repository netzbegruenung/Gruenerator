import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

import { lookupMeinungsbildByTopic } from '../../../../services/monitor/MeinungsbildService.js';
import { createLogger } from '../../../../utils/logger.js';

import type { ToolDependencies } from './registry.js';

const log = createLogger('Tool:Meinungsbild');

export function createLookupMeinungsbildTool(_deps: ToolDependencies): DynamicStructuredTool {
  // @ts-expect-error - Zod schema type compatibility with LangChain ToolInputSchemaBase
  return new DynamicStructuredTool({
    name: 'lookup_meinungsbild',
    description:
      'Suche nach Meinungsumfragen und öffentlicher Meinung zu politischen Themen in Deutschland. ' +
      'Liefert MRP-Schätzungen (Multilevel Regression) auf Bundesland-Ebene, basierend auf ~118.000 Befragten. ' +
      'Themen: Bürgergeld, Klimaschutz, Tempolimit, Kernenergie, Zuwanderung, Schuldenbremse, Mietpreise, ' +
      'Waffenlieferungen Ukraine, Gleichstellung, Wahlalter 16, EU-Integration, Steuern, u.v.m.',
    schema: z
      .object({
        topic: z
          .string()
          .describe(
            'Das Thema der Meinungsumfrage, z.B. "Bürgergeld", "Klimaschutz", "Tempolimit"'
          ),
      })
      .describe('Meinungsbild Lookup'),
    func: async (input: { topic: string }) => {
      const { topic } = input;
      log.info(`[Meinungsbild] Lookup: "${topic}"`);

      const result = await lookupMeinungsbildByTopic(topic);
      if (!result) {
        return 'Keine Meinungsbild-Daten zu diesem Thema gefunden. Verfügbare Themen umfassen u.a. Bürgergeld, Klimaschutz, Tempolimit, Kernenergie, Zuwanderung, Schuldenbremse, Mietpreise, Waffenlieferungen.';
      }

      return result;
    },
  });
}
