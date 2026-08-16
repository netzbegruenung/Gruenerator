/**
 * Sharepic-variant generation shared by the `sharepic` intent, the sharepic
 * half of the EXPERIMENTAL `social_post` intent and the agentic loop's fat
 * sharepic tool.
 */

import { type ExpressRequest as SharepicExpressRequest } from '../../../../services/chat/sharepicGenerationService.js';
import { toUserFacingMessage } from '../../../../utils/errors/index.js';
import { createLogger } from '../../../../utils/logger.js';
import { renderSourceLines, withResearchedSources } from '../agenticLoop/sourceRegistry.js';
import { resolveSharepicAuthorName } from '../artifactGeneration.js';
import { buildCreateTurnContext, SHAREPIC_CONTEXT_CHARS } from '../createTurn.js';
import { extractTextContent } from '../messageHelpers.js';
import { resolveReferentialTopic } from '../referentialTopic.js';
import {
  detectPreferredVariant,
  generateSharepicVariants,
  type PriorSharepic,
  type SharepicVariant,
} from '../sharepicVariantHelpers.js';
import { generateSliderDeckVariant } from '../sliderDeckService.js';
import { getRecentThreadSources } from '../threadPersistenceService.js';

import type { ChatGraphState } from '../../../../agents/langgraph/ChatGraph/types.js';
import type { SSEEmitter, SSEWriter } from '../sseHelpers.js';
import type { Request } from 'express';

const log = createLogger('ChatGraphController');

/**
 * The material a sharepic is built from: the thread transcript plus whatever
 * research the thread already carries.
 *
 * This is the same briefing `runCreateTurn` gives documents, sheets and
 * presentations — the sharepic lane never went through it, so `{{details}}` in
 * every sharepic template stayed empty on fresh generations and the model had
 * to invent the substance behind a three-word topic.
 *
 * Never throws: a sharepic without background is the old behaviour, a 500 is
 * not.
 */
async function buildSharepicBackground(
  state: ChatGraphState,
  threadId: string | null
): Promise<string | null> {
  const transcript = buildCreateTurnContext(state.messages ?? [], SHAREPIC_CONTEXT_CHARS);
  let background = transcript.trim();
  if (threadId) {
    try {
      const carried = await getRecentThreadSources(threadId, 6);
      if (carried.length > 0) {
        background = withResearchedSources(background, renderSourceLines(carried));
      }
    } catch (err) {
      log.warn(`[Sharepic] source briefing skipped: ${err instanceof Error ? err.message : err}`);
    }
  }
  return background || null;
}

/**
 * Emits its own `sharepic_complete` (including error payloads) and returns the
 * variants ([] on failure) so callers never have to duplicate the SSE handling.
 */
export async function runSharepicGeneration(opts: {
  state: ChatGraphState;
  sse: SSEWriter;
  req?: Request | undefined;
  threadId?: string | null;
  sharepicRefinement?: { instruction: string; prior: PriorSharepic };
  /**
   * Receives `sharepic_complete` instead of the live stream. The social_post
   * branch passes a buffer so the graphic can still be revoked if the text half
   * turns out to be a refusal (fabricated-quote gate).
   */
  emitTo?: SSEEmitter;
}): Promise<SharepicVariant[]> {
  const { state, sse } = opts;
  const emit = opts.emitTo ?? sse;
  try {
    const lastMsg = state.messages?.[state.messages.length - 1];
    const rawText = lastMsg ? extractTextContent(lastMsg.content) : '';
    const messageText = rawText.replace(/@sharepic\b/gi, '').trim();
    const refinement = opts.sharepicRefinement;
    const preferredVariant = refinement ? null : detectPreferredVariant(messageText);
    // WHAT it is about. A follow-up like "jetzt noch ein normales sharepic"
    // names no subject, so the classifier resolves one against the history —
    // it already runs on exactly these vague turns with the conversation in
    // context. `resolveReferentialTopic` is the fallback for turns that never
    // reached the LLM (heuristic classification, forced tools). Variant
    // preference is still read from the CURRENT message above.
    const resolvedTopic = refinement
      ? { text: messageText, inherited: false }
      : state.creationTopic
        ? { text: state.creationTopic, inherited: true }
        : resolveReferentialTopic(messageText, state.messages ?? []);
    const topicText = resolvedTopic.text;

    // WHAT it is built FROM. Same thread transcript + carried research the
    // document/sheet/presentation generators get from runCreateTurn; a sharepic
    // condenses far harder, hence the smaller window.
    const background = refinement
      ? null
      : await buildSharepicBackground(state, opts.threadId ?? null);

    // Quote sharepics are attributed to the person creating them — default the
    // author to the user's profile display name. Empty when no profile name
    // exists, in which case the quote renders without an author line.
    const authorName = await resolveSharepicAuthorName(state.agentConfig?.userId);

    log.info(
      `[ChatGraph] Sharepic topic: "${topicText.slice(0, 100)}"${resolvedTopic.inherited ? ` (resolved from context, message was "${messageText.slice(0, 60)}")` : ''}, ` +
        `background: ${background ? `${background.length} chars` : 'none'}, ` +
        `${refinement ? `refinement: "${refinement.instruction}" (${refinement.prior.canvasType})` : `preferredVariant: ${preferredVariant ?? 'all'}`}, ` +
        `author: ${authorName || '(none)'}`
    );

    if (!opts.req) throw new Error('Express request required for sharepic generation');
    // Slider = multi-page deck, a different artifact: ONE deck variant,
    // minted at generation time (studio open/editing need the pages).
    let variants: SharepicVariant[];
    let declinedReason: string | null = null;
    if (preferredVariant === 'slider') {
      const userId = state.agentConfig?.userId;
      if (!userId) throw new Error('User required for slider deck creation');
      variants = [
        await generateSliderDeckVariant({
          req: opts.req,
          text: topicText,
          threadId: opts.threadId ?? null,
          userId,
        }),
      ];
    } else {
      const generated = await generateSharepicVariants({
        req: opts.req as SharepicExpressRequest,
        text: topicText,
        ...(refinement ? { refinement } : preferredVariant ? { preferredVariant } : {}),
        ...(background && { background }),
        ...(authorName && { authorName }),
        ...(state.userLocale && { userLocale: state.userLocale }),
      });
      variants = generated.variants;
      declinedReason = generated.declinedReason;
    }

    if (variants.length === 0) {
      // A policy decline is not an outage. The combined social_post path already
      // says so ("dabei entstünde ein erfundenes Zitat…"); the pure sharepic
      // path used to report the model's correct refusal as a technical failure,
      // which invites the user to simply try again.
      if (declinedReason) {
        log.info(`[ChatGraph] Sharepic declined on policy grounds — ${declinedReason}`);
        emit.send('sharepic_complete', {
          message: `Dieses Sharepic kann ich nicht erstellen: ${declinedReason}`,
          variants: [],
          declined: true,
        });
        return [];
      }
      emit.send('sharepic_complete', {
        message: 'Sharepic-Erstellung fehlgeschlagen',
        variants: [],
        error: 'All variant generations failed',
      });
      return [];
    }
    emit.send('sharepic_complete', {
      message: `${variants.length} Sharepic-Varianten erstellt`,
      variants,
    });
    return variants;
  } catch (error) {
    log.error('[ChatGraph] Sharepic variant generation failed:', error);
    emit.send('sharepic_complete', {
      message: 'Sharepic-Erstellung fehlgeschlagen',
      variants: [],
      error: toUserFacingMessage(error, 'Unknown error'),
    });
    return [];
  }
}
