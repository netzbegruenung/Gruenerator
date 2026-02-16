/**
 * Tool Registry
 *
 * Assembles the set of tools available to the deep agent based on
 * agent configuration and enabled tools. Each tool wraps an existing
 * service — no business logic is duplicated.
 */

import { createDraftStructuredTool } from './draftStructured.js';
import { createEditImageTool } from './editImage.js';
import { createGenerateImageTool } from './generateImage.js';
import { createRecallMemoryTool } from './recallMemory.js';
import { createResearchTool } from './research.js';
import { createSaveMemoryTool } from './saveMemory.js';
import { createScrapeUrlTool } from './scrapeUrl.js';
import { createSearchDocumentsTool } from './searchDocuments.js';
import { createSearchExamplesTool } from './searchExamples.js';
import { createSearchUserContentTool } from './searchUserContent.js';
import { createSelfReviewTool } from './selfReview.js';
import { createWebSearchTool } from './webSearch.js';

import type { AgentConfig } from '../../../../routes/chat/agents/types.js';
import type { GeneratedImageResult, ImageAttachment, ThreadAttachment } from '../types.js';
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
  imageAttachments?: ImageAttachment[];
  _generatedImage?: GeneratedImageResult | null;
  userId?: string;
  userLocale?: string;
  defaultNotebookCollectionIds?: string[];
}

interface ToolEntry {
  key: string;
  factory: (deps: ToolDependencies) => DynamicStructuredTool | null;
}

const TOOL_ENTRIES: ToolEntry[] = [
  { key: 'search', factory: createSearchDocumentsTool },
  { key: 'web', factory: createWebSearchTool },
  { key: 'research', factory: createResearchTool },
  { key: 'examples', factory: createSearchExamplesTool },
  { key: 'image', factory: createGenerateImageTool },
  { key: 'image_edit', factory: createEditImageTool },
  { key: 'scrape', factory: createScrapeUrlTool },
  { key: 'memory', factory: createRecallMemoryTool },
  { key: 'memory_save', factory: createSaveMemoryTool },
  { key: 'self_review', factory: createSelfReviewTool },
  { key: 'draft_structured', factory: createDraftStructuredTool },
  { key: 'user_content', factory: createSearchUserContentTool },
];

/**
 * Build the array of tools for the agent based on enabled tools config.
 *
 * Two-layer filtering:
 * 1. Agent-level: agentConfig.enabledTools whitelist (server-side, per-agent)
 * 2. Frontend-level: deps.enabledTools toggle (user-side, per-session)
 *
 * A tool is included if:
 * - The agent allows it (no whitelist = all allowed)
 * - The frontend hasn't disabled it (or it's in the always-enabled set)
 */
export function buildTools(deps: ToolDependencies): DynamicStructuredTool[] {
  const alwaysEnabled = new Set(['scrape', 'memory', 'memory_save', 'user_content']);
  const agentWhitelist = deps.agentConfig.enabledTools;
  const tools: DynamicStructuredTool[] = [];

  for (const entry of TOOL_ENTRIES) {
    // Layer 1: Agent-level whitelist (if defined, tool key must be in it)
    if (agentWhitelist && !agentWhitelist.includes(entry.key)) {
      continue;
    }

    // Layer 2: Frontend toggle (always-enabled tools skip this check)
    if (!alwaysEnabled.has(entry.key) && deps.enabledTools[entry.key] === false) {
      continue;
    }

    const tool = entry.factory(deps);
    if (tool) {
      tools.push(tool);
    }
  }

  return tools;
}

/**
 * German labels for tool names, used in SSE thinking_step events.
 */
export const TOOL_LABELS: Record<string, string> = {
  search_documents: 'Durchsuche Dokumente...',
  web_search: 'Websuche...',
  research: 'Deep Research...',
  search_examples: 'Suche Beispiele...',
  generate_image: 'Generiere Bild...',
  edit_image: 'Bearbeite Bild...',
  scrape_url: 'Lade URL-Inhalt...',
  recall_memory: 'Rufe Erinnerungen ab...',
  save_memory: 'Speichere Information...',
  self_review: 'Prüfe Entwurf...',
  draft_structured: 'Erstelle strukturierten Entwurf...',
  search_user_content: 'Durchsuche Nutzerdokumente...',
};
