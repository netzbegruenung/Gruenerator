/**
 * Recall Memory Tool
 *
 * Retrieves stored memories about the user from mem0 cross-thread storage.
 * Enables the agent to access persistent facts from previous conversations.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

import { getMem0Instance } from '../../../../services/mem0/index.js';
import { createLogger } from '../../../../utils/logger.js';

import type { ToolDependencies } from './registry.js';

const log = createLogger('Tool:RecallMemory');

export function createRecallMemoryTool(deps: ToolDependencies): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'recall_memory',
    description:
      'Rufe gespeicherte Informationen über den Nutzer aus früheren Gesprächen ab. ' +
      'Nutze dieses Tool wenn der Nutzer auf frühere Gespräche verweist, ' +
      'persönliche Informationen erwartet oder du Kontext brauchst.',
    schema: z.object({
      query: z.string().describe('Wonach in den Erinnerungen gesucht werden soll'),
    }),
    func: async ({ query }) => {
      const mem0 = getMem0Instance();
      if (!mem0) {
        return 'Erinnerungssystem nicht verfügbar.';
      }

      const userId = (deps.agentConfig as any).userId;
      if (!userId) {
        return 'Kein Nutzer-Kontext für Erinnerungsabruf.';
      }

      log.info(`[RecallMemory] query="${query.slice(0, 60)}" userId=${userId}`);

      try {
        const memories = await mem0.searchMemories(query, userId, 5);

        if (memories.length === 0) {
          return 'Keine relevanten Erinnerungen gefunden.';
        }

        const formatted = memories.map((m: any, i: number) => `${i + 1}. ${m.memory}`).join('\n');

        return `${memories.length} Erinnerungen gefunden:\n\n${formatted}`;
      } catch (error: any) {
        log.error('[RecallMemory] Error:', error.message);
        return `Erinnerungsabruf fehlgeschlagen: ${error.message}`;
      }
    },
  });
}
