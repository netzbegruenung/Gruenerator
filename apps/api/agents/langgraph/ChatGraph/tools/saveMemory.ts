/**
 * Save Memory Tool
 *
 * Saves important information about the user to mem0 persistent storage.
 * Enables cross-thread memory for personalized interactions.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

import { getMem0Instance } from '../../../../services/mem0/index.js';
import { createLogger } from '../../../../utils/logger.js';

import type { ToolDependencies } from './registry.js';

const log = createLogger('Tool:SaveMemory');

export function createSaveMemoryTool(deps: ToolDependencies): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'save_memory',
    description:
      'Speichere wichtige Informationen über den Nutzer für zukünftige Gespräche. ' +
      'Nutze dieses Tool wenn der Nutzer persönliche Informationen teilt die er erinnert haben möchte ' +
      '(z.B. "ich bin Stadtrat in Freiburg", "merke dir: ...").',
    schema: z.object({
      content: z.string().describe('Die zu speichernde Information'),
      category: z
        .enum(['personal', 'preference', 'context', 'task'])
        .optional()
        .describe('Kategorie der Erinnerung'),
    }),
    func: async ({ content, category }) => {
      const mem0 = getMem0Instance();
      if (!mem0) {
        return 'Erinnerungssystem nicht verfügbar.';
      }

      const userId = (deps.agentConfig as any).userId;
      if (!userId) {
        return 'Kein Nutzer-Kontext zum Speichern.';
      }

      log.info(`[SaveMemory] content="${content.slice(0, 60)}" category=${category || 'none'}`);

      try {
        await mem0.addMemories([{ role: 'user', content }], userId, {
          category: category || 'context',
        });

        return `Information gespeichert: "${content.slice(0, 100)}${content.length > 100 ? '...' : ''}"`;
      } catch (error: any) {
        log.error('[SaveMemory] Error:', error.message);
        return `Speichern fehlgeschlagen: ${error.message}`;
      }
    },
  });
}
