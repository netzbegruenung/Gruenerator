import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

import { lookupBundeslandProfile } from '../../../../services/monitor/StateElectionsService.js';
import { createLogger } from '../../../../utils/logger.js';

import type { ToolDependencies } from './registry.js';

const log = createLogger('Tool:Bundesland');

export function createLookupBundeslandTool(_deps: ToolDependencies): DynamicStructuredTool {
  // @ts-expect-error - Zod schema type compatibility with LangChain ToolInputSchemaBase
  return new DynamicStructuredTool({
    name: 'lookup_bundesland',
    description:
      'Liefert ein kompaktes Datenprofil zu einem deutschen Bundesland: aktuelle Sonntagsfrage, ' +
      'das jüngste Landtagswahlergebnis und das Meinungsbild (MRP-Schätzung der öffentlichen Meinung ' +
      'zu politischen Themen) für dieses Land. Nutze dieses Tool, wenn nach einem konkreten Bundesland ' +
      'gefragt wird (z.B. "Was denkt Bayern?", "Umfragen in Sachsen", "Wahlergebnis Hessen").',
    schema: z
      .object({
        bundesland: z
          .string()
          .describe('Name des Bundeslandes, z.B. "Bayern", "Sachsen", "Nordrhein-Westfalen"'),
      })
      .describe('Bundesland Lookup'),
    func: async (input: { bundesland: string }) => {
      const { bundesland } = input;
      log.info(`[Bundesland] Lookup: "${bundesland}"`);

      const result = await lookupBundeslandProfile(bundesland);
      if (!result) {
        return 'Kein Datenprofil zu diesem Bundesland gefunden. Verfügbar sind die 16 deutschen Bundesländer, z.B. Bayern, Sachsen, Nordrhein-Westfalen, Berlin, Hamburg.';
      }

      return result;
    },
  });
}
