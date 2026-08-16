/**
 * Prose → structured-artifact helpers for the board agent.
 *
 * Sheets/presentations reuse the chat compound-loop's structure generator
 * `runDocGeneration` (generate JSON structure → create the collaborative
 * document). Research already happened upstream: the @mention path runs
 * `generateFromState` (search/research tools) first and feeds the researched
 * prose in here; the AI-column path passes its already-researched `content`.
 * So these helpers do a single structure-generation pass, no research of their
 * own — exactly the split the chat loop uses (loop model researches, fat tool
 * only structures).
 *
 * Task lists have no document target, so `generateTaskList` is a small local
 * generator returning parsed tasks for `addRowsToBoardLive`.
 */
import { runDocGeneration } from '../../../routes/chat/services/intentExecutionService.js';
import { createLogger } from '../../../utils/logger.js';
import { aiText } from '../../ai/generate.js';

import { TASK_LIST_PROMPT, parseTaskList, type GeneratedTask } from './taskListParse.js';

const log = createLogger('boardArtifactGen');

export interface CreatedArtifact {
  id: string;
  title: string;
  url: string; // always `/office/${id}`
}

/**
 * Headless wrapper around `runDocGeneration`. Its `req` is only forwarded to
 * `aiClient.processRequest`, which reads at most `req.user?.id` — a stub
 * fully satisfies it (no Express request exists in the background worker).
 */
async function createArtifactFromText(
  kind: 'sheet' | 'presentation',
  sourceText: string,
  userId: string
): Promise<CreatedArtifact | null> {
  const created = await runDocGeneration({
    kind,
    userContent: sourceText,
    req: { user: { id: userId } } as unknown as Express.Request,
    userId,
  });
  return created ? { id: created.documentId, title: created.title, url: created.url } : null;
}

export const createSheetFromText = (sourceText: string, userId: string) =>
  createArtifactFromText('sheet', sourceText, userId);

export const createPresentationFromText = (sourceText: string, userId: string) =>
  createArtifactFromText('presentation', sourceText, userId);

// ── Task-list generation (for creating cards, not a document) ────────────────

export type { GeneratedTask };

/**
 * Generate a task list from (already-researched) prose. Returns [] on failure.
 *
 * Through the typed facade rather than `processRequest`: this is the module's
 * own model call, so nothing downstream needs the envelope. `doc_generation` is
 * a routed lane, which is what makes the swap mechanical — the parity test in
 * `services/ai/__tests__/lanes.vitest.ts` pins both tables to the same target.
 * The `userId` parameter went with it: `processRequest` reads at most
 * `req.user?.id`, and nothing on this path did.
 */
export async function generateTaskList(sourceText: string): Promise<GeneratedTask[]> {
  try {
    const content = await aiText({
      lane: 'doc_generation',
      system: TASK_LIST_PROMPT,
      prompt: sourceText,
      temperature: 0.3,
      maxOutputTokens: 2000,
      json: true,
    });
    return parseTaskList(content);
  } catch (err) {
    log.warn(`Task list generation failed: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}
