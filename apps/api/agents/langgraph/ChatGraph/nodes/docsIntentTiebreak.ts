/**
 * Docs-panel intent tiebreak.
 *
 * The classifier's fast-path regex (`DOC_MODIFY_PATTERN`) catches the common
 * explicit-edit verbs (verbesser, kürz, erweiter, bearbeit, …). When the user
 * is in the docs editor and the regex misses, we don't want to silently fall
 * through to the chat path — that's where the original "model emits fake
 * `modify_doc` markdown but the document never changes" failure came from.
 *
 * Instead, ask the decision model (`aiDecide`: Clef Flash, Metis as hedge)
 * whether the message is an "edit" or a "question". This catches indirect
 * phrasings the regex can't cover:
 *   - comparatives where the verb isn't explicit ("kannst du das anders machen?")
 *   - English / mixed-language requests inside a German session
 *   - colloquialisms ("weg damit", "in besseres Deutsch bringen", "polish this")
 *   - confirmation follow-ups ("ja, mach das", "weiter so")
 *
 * Design constraints:
 *   - Hard timeout so the user doesn't wait noticeably longer than the regex
 *     path. This sits on the critical path of every docs-panel message the
 *     regex misses.
 *   - Fail-safe: any error/timeout returns `null`, which the caller treats
 *     as "fall through to chat". Never blocks the user.
 *
 * Measured in `evals/metis` (`docsTiebreak`, 40 cases × 2 runs): Clef Flash,
 * Metis and the former Mistral Small prompt all 100 %; p90 of the hedged
 * call 142 ms against an LLM median of 201 ms.
 */

import { aiDecide, type ChoiceQuestion } from '../../../../services/ai/decide.js';
import { createLogger } from '../../../../utils/logger.js';

const log = createLogger('ChatGraph:DocsTiebreak');

/**
 * Kept from the LLM version: one slow host must not push the resolver into
 * `null` (which costs the turn far more than the wait). `aiDecide` asks Metis
 * after 400 ms, so 1500 ms leaves room for that hedge.
 */
const TIEBREAK_TIMEOUT_MS = 1500;

/** Labelled plain text with short options measured best; long instructions hurt. */
const TIEBREAK_QUESTION: ChoiceQuestion = {
  type: 'choice',
  instructions:
    'Verlangt die NACHRICHT, dass der Text des offenen Dokuments geändert wird? Im Zweifel: edit.',
  criteria: {
    edit: 'den Dokumenttext ändern: umformulieren, kürzen, ergänzen, löschen, übersetzen, korrigieren – auch indirekt oder als Kritik am Text',
    question:
      'eine Frage zum Dokument oder Thema: erklären, zusammenfassen, bewerten, recherchieren – der Text bleibt, wie er ist',
  },
};

export type DocsTiebreakDecision = 'edit' | 'question' | null;

interface TiebreakArgs {
  userContent: string;
  conversationContext: string | null;
}

/**
 * Returns 'edit' | 'question' on a decision, or null if the decision model
 * failed or timed out. Caller must treat null as "fall through to existing
 * chat path".
 */
export async function classifyDocsIntentTiebreak({
  userContent,
  conversationContext,
}: TiebreakArgs): Promise<DocsTiebreakDecision> {
  const startTime = Date.now();
  const state = conversationContext
    ? `BISHERIGER VERLAUF:\n${conversationContext}\n\nNACHRICHT IM DOKUMENT-EDITOR:\n${userContent}`
    : `NACHRICHT IM DOKUMENT-EDITOR:\n${userContent}`;

  try {
    const { intent } = await aiDecide({
      label: 'DocsTiebreak',
      state,
      questions: { intent: TIEBREAK_QUESTION },
      timeoutMs: TIEBREAK_TIMEOUT_MS,
    });
    const decision =
      intent.choice === 'edit' || intent.choice === 'question' ? intent.choice : null;
    log.info(
      `[DocsTiebreak] ${decision ?? 'unrecognized'} in ${Date.now() - startTime}ms — "${userContent.slice(0, 60)}"`
    );
    return decision;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    log.warn(
      `[DocsTiebreak] Failed (${Date.now() - startTime}ms): ${reason}. Falling through to chat.`
    );
    return null;
  }
}
