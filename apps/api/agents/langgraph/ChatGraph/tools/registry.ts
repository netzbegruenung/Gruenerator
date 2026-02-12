/**
 * Tool Registry
 *
 * Assembles the set of tools available to the deep agent based on
 * agent configuration and enabled tools. Each tool wraps an existing
 * service — no business logic is duplicated.
 */

import { createGenerateImageTool } from './generateImage.js';
import { createRecallMemoryTool } from './recallMemory.js';
import { createResearchTool } from './research.js';
import { createSaveMemoryTool } from './saveMemory.js';
import { createScrapeUrlTool } from './scrapeUrl.js';
import { createSearchDocumentsTool } from './searchDocuments.js';
import { createSearchExamplesTool } from './searchExamples.js';
import { createWebSearchTool } from './webSearch.js';

import type { AgentConfig } from '../../../../routes/chat/agents/types.js';
import type { GeneratedImageResult, ThreadAttachment } from '../types.js';
import type { DynamicStructuredTool } from '@langchain/core/tools';

/**
 * Dependencies injected into tools from the controller.
 * This avoids tools needing to import global singletons.
 */
export interface ToolDependencies {
  agentConfig: AgentConfig;
  aiWorkerPool: any;
  enabledTools: Record<string, boolean>;
  threadAttachments?: ThreadAttachment[];
  _generatedImage?: GeneratedImageResult | null;
}

interface ToolEntry {
  key: string;
  factory: (deps: ToolDependencies) => DynamicStructuredTool;
}

const TOOL_ENTRIES: ToolEntry[] = [
  { key: 'search', factory: createSearchDocumentsTool },
  { key: 'web', factory: createWebSearchTool },
  { key: 'research', factory: createResearchTool },
  { key: 'examples', factory: createSearchExamplesTool },
  { key: 'image', factory: createGenerateImageTool },
  { key: 'scrape', factory: createScrapeUrlTool },
  { key: 'memory', factory: createRecallMemoryTool },
  { key: 'memory', factory: createSaveMemoryTool },
];

/**
 * Build the array of tools for the agent based on enabled tools config.
 * scrape_url, recall_memory, save_memory are always enabled.
 */
export function buildTools(deps: ToolDependencies): DynamicStructuredTool[] {
  const alwaysEnabled = new Set(['scrape', 'memory']);
  const tools: DynamicStructuredTool[] = [];

  for (const entry of TOOL_ENTRIES) {
    // Always-enabled tools skip the enabledTools check
    if (!alwaysEnabled.has(entry.key)) {
      if (deps.enabledTools[entry.key] === false) {
        continue;
      }
    }

    tools.push(entry.factory(deps));
  }

  return tools;
}

/**
 * German labels for tool names, used in SSE thinking_step events.
 */
export const TOOL_LABELS: Record<string, string> = {
  search_documents: 'Durchsuche Dokumente...',
  web_search: 'Suche im Web...',
  research: 'Recherchiere...',
  search_examples: 'Suche Beispiele...',
  generate_image: 'Generiere Bild...',
  scrape_url: 'Lade URL-Inhalt...',
  recall_memory: 'Rufe Erinnerungen ab...',
  save_memory: 'Speichere Information...',
};
