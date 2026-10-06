/**
 * Sharepic generation shared by the `sharepic` intent and the agentic loop's
 * fat sharepic tool. Drafts one creator sharepic; only refinements of old
 * template sharepics (no `creatorSpec`) still go through the legacy variants.
 */

import { parseSharepicChatProps } from '@gruenerator/contracts';

import { type ExpressRequest as SharepicExpressRequest } from '../../../../services/chat/sharepicGenerationService.js';
import { DraftFailedError } from '../../../../services/sharepicCreator/draftAgent.js';
import { namedSharepicForm } from '../../../../services/sharepicCreator/forms.js';
import { toUserFacingMessage } from '../../../../utils/errors/index.js';
import { createLogger } from '../../../../utils/logger.js';
import { renderSourceLines, withResearchedSources } from '../agenticLoop/sourceRegistry.js';
import { resolveSharepicAuthorName } from '../artifactGeneration.js';
import { buildCreateTurnContext, SHAREPIC_CONTEXT_CHARS } from '../createTurn.js';
import { extractTextContent } from '../messageHelpers.js';
import { resolveReferentialTopic } from '../referentialTopic.js';
import {
  asksForAlternative,
  createCreatorSharepic,
  firstSlideText,
  reviseCreatorSharepic,
} from '../sharepicCreatorVariant.js';
import {
  generateSharepicVariants,
  getLastSharepicVariant,
  type PriorSharepic,
  type SharepicVariant,
} from '../sharepicVariantHelpers.js';
import { getRecentThreadSources } from '../threadPersistenceService.js';

import type { ChatGraphState } from '../../../../agents/langgraph/ChatGraph/types.js';
import type { SSEWriter } from '../sseHelpers.js';
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
}): Promise<SharepicVariant[]> {
  const { state, sse } = opts;
  try {
    const lastMsg = state.messages?.[state.messages.length - 1];
    const rawText = lastMsg ? extractTextContent(lastMsg.content) : '';
    const messageText = rawText.replace(/@sharepic\b/gi, '').trim();
    const refinement = opts.sharepicRefinement;
    // WHAT it is about. A follow-up like "jetzt noch ein normales sharepic"
    // names no subject, so the classifier resolves one against the history —
    // it already runs on exactly these vague turns with the conversation in
    // context. `resolveReferentialTopic` is the fallback for turns that never
    // reached the LLM (heuristic classification, forced tools).
    const resolvedTopic = refinement
      ? { text: messageText, inherited: false }
      : state.creationTopic
        ? { text: state.creationTopic, inherited: true }
        : resolveReferentialTopic(messageText, state.messages ?? []);
    const topicText = resolvedTopic.text;

    // WHAT it is built FROM. Same thread transcript + carried research the
    // document/sheet/presentation generators get from runCreateTurn; a sharepic
    // condenses far harder, hence the smaller window.
    // "Eine andere Variante" drafts afresh and needs the material again.
    const background =
      refinement && !asksForAlternative(refinement.instruction)
        ? null
        : await buildSharepicBackground(state, opts.threadId ?? null);

    const priorCreatorSpec = refinement
      ? (parseSharepicChatProps(refinement.prior.props)?.creatorSpec ?? null)
      : null;

    log.info(
      `[ChatGraph] Sharepic topic: "${topicText.slice(0, 100)}"${resolvedTopic.inherited ? ` (resolved from context, message was "${messageText.slice(0, 60)}")` : ''}, ` +
        `background: ${background ? `${background.length} chars` : 'none'}` +
        `${refinement ? `, refinement: "${refinement.instruction}" (${refinement.prior.canvasType})` : ''}`
    );

    if (refinement && !priorCreatorSpec) {
      // A template sharepic from before the creator: refined the old way.
      if (!opts.req) throw new Error('Express request required for sharepic generation');
      // Quote sharepics are attributed to the person creating them — default the
      // author to the user's profile display name. Empty when no profile name
      // exists, in which case the quote renders without an author line.
      const authorName = await resolveSharepicAuthorName(state.agentConfig?.userId);
      log.info(`[ChatGraph] Legacy sharepic refinement, author: ${authorName || '(none)'}`);
      const generated = await generateSharepicVariants({
        req: opts.req as SharepicExpressRequest,
        refinement,
        ...(authorName && { authorName }),
        ...(state.userLocale && { userLocale: state.userLocale }),
      });
      const variants = generated.variants;
      const declinedReason = generated.declinedReason;

      if (variants.length === 0) {
        // A policy decline is not an outage. The combined social_post path already
        // says so ("dabei entstünde ein erfundenes Zitat…"); the pure sharepic
        // path used to report the model's correct refusal as a technical failure,
        // which invites the user to simply try again.
        if (declinedReason) {
          log.info(`[ChatGraph] Sharepic declined on policy grounds — ${declinedReason}`);
          sse.send('sharepic_complete', {
            message: `Dieses Sharepic kann ich nicht erstellen: ${declinedReason}`,
            variants: [],
            declined: true,
          });
          return [];
        }
        sse.send('sharepic_complete', {
          message: 'Sharepic-Erstellung fehlgeschlagen',
          variants: [],
          error: 'All variant generations failed',
        });
        return [];
      }
      sse.send('sharepic_complete', {
        message: `${variants.length} Sharepic-Varianten erstellt`,
        variants,
      });
      return variants;
    }

    const locale = state.userLocale === 'de-AT' ? 'de-AT' : 'de-DE';
    let variant: SharepicVariant;
    if (refinement && priorCreatorSpec && !asksForAlternative(refinement.instruction)) {
      variant = await reviseCreatorSharepic({
        instruction: refinement.instruction,
        prior: refinement.prior,
        spec: priorCreatorSpec,
        userId: state.agentConfig?.userId ?? null,
      });
    } else {
      // A fresh draft. "Eine andere Variante": the previous creator draft goes
      // along as the layout to avoid, and its texts keep the topic.
      const wantsAlternative = asksForAlternative(refinement?.instruction ?? messageText);
      const prior = !wantsAlternative
        ? null
        : (refinement?.prior ??
          (opts.threadId ? await getLastSharepicVariant(opts.threadId) : null));
      const avoid = prior ? (parseSharepicChatProps(prior.props)?.creatorSpec ?? null) : null;
      const brief =
        refinement && avoid
          ? `${refinement.instruction}\n\nThema wie beim vorigen Sharepic: ${firstSlideText(avoid)}`
          : topicText;
      variant = await createCreatorSharepic({
        brief,
        background,
        avoid,
        locale,
        userId: state.agentConfig?.userId ?? null,
        form: namedSharepicForm(refinement?.instruction ?? messageText),
      });
    }
    sse.send('sharepic_complete', { message: 'Sharepic entworfen', variants: [variant] });
    return [variant];
  } catch (error) {
    if (error instanceof DraftFailedError) {
      log.warn(`[ChatGraph] Sharepic draft failed: ${error.message}`);
      // The client shows `message`, not `error`.
      const hint = opts.sharepicRefinement
        ? 'Die Überarbeitung ist nicht gelungen. Formuliere die Änderung etwas genauer und versuch es noch einmal.'
        : 'Der Entwurf ist nicht gelungen. Formuliere den Auftrag etwas genauer und versuch es noch einmal.';
      sse.send('sharepic_complete', {
        message: hint,
        variants: [],
        error: 'Sharepic draft failed',
      });
      return [];
    }
    log.error('[ChatGraph] Sharepic variant generation failed:', error);
    sse.send('sharepic_complete', {
      message: 'Sharepic-Erstellung fehlgeschlagen',
      variants: [],
      error: toUserFacingMessage(error, 'Unknown error'),
    });
    return [];
  }
}
