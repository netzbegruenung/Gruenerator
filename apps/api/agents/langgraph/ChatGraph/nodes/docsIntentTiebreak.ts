/**
 * Docs-panel intent tiebreak.
 *
 * The classifier's fast-path regex (`DOC_MODIFY_PATTERN`) catches the common
 * explicit-edit verbs (verbesser, kürz, erweiter, bearbeit, …). When the user
 * is in the docs editor and the regex misses, we don't want to silently fall
 * through to the chat path — that's where the original "model emits fake
 * `modify_doc` markdown but the document never changes" failure came from.
 *
 * Instead, ask a small fast LLM to classify the message as "edit" or
 * "question". This catches indirect phrasings the regex can't cover:
 *   - comparatives where the verb isn't explicit ("kannst du das anders machen?")
 *   - English / mixed-language requests inside a German session
 *   - colloquialisms ("weg damit", "in besseres Deutsch bringen", "polish this")
 *   - confirmation follow-ups ("ja, mach das", "weiter so")
 *
 * Design constraints:
 *   - Hard timeout (800ms) so the user doesn't wait noticeably longer than
 *     the regex path. The classifier sits on the user's critical request
 *     path; a slow LLM call here delays *every* response in the docs panel.
 *   - Fail-safe: any error/timeout returns `null`, which the caller treats
 *     as "fall through to chat". Never blocks the user.
 *   - Uses the same `INTERMEDIATE_MODEL` (regolo + mistral-small-4-119b) that
 *     the existing Tier-4 LLM classification uses. Inherits the worker
 *     pool's provider-fallback infrastructure rather than adding new
 *     resilience surface.
 */

import { createLogger } from '../../../../utils/logger.js';
import { INTERMEDIATE_MODEL } from '../llmConfig.js';

import type { AIWorkerPool } from '../../../../workers/types.js';

const log = createLogger('ChatGraph:DocsTiebreak');

const TIEBREAK_TIMEOUT_MS = 800;

const TIEBREAK_PROMPT = `Du bist ein Klassifizierer im Dokument-Editor von Grünerator. Der/die Nutzer*in arbeitet aktiv an einem Dokument und der KI-Bearbeitungsmodus ist eingeschaltet.

Entscheide, ob die letzte Nachricht eine BEARBEITUNG des Dokuments verlangt oder eine FRAGE zum Dokument ist.

EDIT: jede Anweisung, die den Dokumenttext verändert — umformulieren, kürzen, verlängern, korrigieren, übersetzen, umstrukturieren, einfügen, löschen. Auch indirekte oder umgangssprachliche Formulierungen ("mach das knackiger", "kannst du das anders?", "in besseres Deutsch", "polish this", "weg damit", "weiter so" nach einer Bearbeitungsanfrage).

QUESTION: Verständnisfragen, Zusammenfassung, Hintergrund-Recherche, Klärung, Meinungsfragen — alles ohne Textänderung am Dokument.

Im Zweifel: EDIT (der Nutzer ist im Editor mit aktivem Bearbeitungsmodus).

Antworte mit GENAU einem Wort: edit oder question.`;

export type DocsTiebreakDecision = 'edit' | 'question' | null;

interface TiebreakArgs {
  userContent: string;
  conversationContext: string | null;
  aiWorkerPool: AIWorkerPool;
}

/**
 * Returns 'edit' | 'question' on a confident decision, or null if the LLM
 * failed/timed out/returned malformed output. Caller must treat null as
 * "fall through to existing chat path".
 */
export async function classifyDocsIntentTiebreak({
  userContent,
  conversationContext,
  aiWorkerPool,
}: TiebreakArgs): Promise<DocsTiebreakDecision> {
  const startTime = Date.now();
  const userMessage = conversationContext
    ? `${conversationContext}\n\nLetzte Nachricht: "${userContent}"`
    : `Letzte Nachricht: "${userContent}"`;

  try {
    const response = await withTimeout(
      aiWorkerPool.processRequest(
        {
          type: 'chat_intent_classification',
          provider: INTERMEDIATE_MODEL.provider,
          systemPrompt: TIEBREAK_PROMPT,
          messages: [{ role: 'user', content: userMessage }],
          options: {
            model: INTERMEDIATE_MODEL.model,
            max_tokens: 8,
            temperature: 0,
          },
        },
        null
      ),
      TIEBREAK_TIMEOUT_MS
    );

    const decision = normalizeDecision(response.content);
    const elapsedMs = Date.now() - startTime;
    log.info(
      `[DocsTiebreak] ${decision ?? 'unrecognized'} in ${elapsedMs}ms — "${userContent.slice(0, 60)}"`
    );
    return decision;
  } catch (err) {
    const elapsedMs = Date.now() - startTime;
    const reason = err instanceof Error ? err.message : String(err);
    log.warn(`[DocsTiebreak] Failed (${elapsedMs}ms): ${reason}. Falling through to chat.`);
    return null;
  }
}

/**
 * The model is asked to reply with exactly "edit" or "question", but providers
 * sometimes prepend whitespace, quotation marks, or sentence wrappers. Parse
 * leniently — first matching token wins.
 */
function normalizeDecision(raw: string | undefined | null): DocsTiebreakDecision {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  // Order matters: check both, return whichever appears first
  const editIdx = lower.indexOf('edit');
  const questionIdx = lower.indexOf('question');
  if (editIdx === -1 && questionIdx === -1) return null;
  if (editIdx === -1) return 'question';
  if (questionIdx === -1) return 'edit';
  return editIdx < questionIdx ? 'edit' : 'question';
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Tiebreak timeout after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}
