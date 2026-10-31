/**
 * Sharepic generation shared by the `sharepic` intent and the agentic loop's
 * fat sharepic tool. Drafts one creator sharepic; a refinement of an old
 * template sharepic (no `creatorSpec`) becomes a fresh draft on its old text.
 */

import { isDeepStrictEqual } from 'node:util';

import { parseSharepicChatProps, type SharepicVorlage } from '@gruenerator/contracts';
import { grueneJugendRoleLocale } from '@gruenerator/shared/roles';

import { requestedBrand } from '../../../../services/sharepicCreator/brandWords.js';
import { DraftFailedError } from '../../../../services/sharepicCreator/draftAgent.js';
import { draftFailedText } from '../../../../services/sharepicCreator/draftFailure.js';
import { namedSharepicForm, wantsOneSlide } from '../../../../services/sharepicCreator/forms.js';
import { getSharepicVorlage } from '../../../../services/sharepicVorlagen/catalog.js';
import { toUserFacingMessage } from '../../../../utils/errors/index.js';
import { createLogger } from '../../../../utils/logger.js';
import { renderSourceLines, withResearchedSources } from '../agenticLoop/sourceRegistry.js';
import { ARTIFACT_CONFIRMATION_TEXTS, type SharepicTurnFailure } from '../artifactConfirmations.js';
import {
  buildCreateTurnContext,
  SHAREPIC_CONTEXT_CHARS,
  turnMaterialBlock,
} from '../createTurn.js';
import { extractTextContent } from '../messageHelpers.js';
import { resolveReferentialTopic } from '../referentialTopic.js';
import {
  asksForAlternative,
  createCreatorSharepic,
  firstSlideText,
  reviseCreatorSharepic,
} from '../sharepicCreatorVariant.js';
import {
  getLastSharepicVariant,
  type PriorSharepic,
  type SharepicVariant,
} from '../sharepicVariantHelpers.js';
import { getRecentThreadSources } from '../threadPersistenceService.js';

import type { ChatGraphState } from '../../../../agents/langgraph/ChatGraph/types.js';
import type { SSEWriter } from '../sseHelpers.js';

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
export async function buildSharepicBackground(
  state: ChatGraphState,
  threadId: string | null
): Promise<string | null> {
  const transcript = buildCreateTurnContext(state.messages ?? [], SHAREPIC_CONTEXT_CHARS);
  // Was die Person mit dem Auftrag mitgebracht hat (Paste-Chip, Datei): ohne das
  // baute „wandle diese PM in ein Sharepic um" ein Sharepic aus dem Satz allein.
  const material = turnMaterialBlock(state.attachmentContext, SHAREPIC_CONTEXT_CHARS);
  let background = [transcript.trim(), material].filter(Boolean).join('\n\n');
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

const LEGACY_TEXT_KEYS = [
  'label',
  'headline',
  'header',
  'introline',
  'line1',
  'line2',
  'line3',
  'subline',
  'subtext',
  'eventTitle',
  'beschreibung',
  'accent',
  'quote',
  'subheader',
  'body',
  'text',
  'name',
] as const;

/** The text of a pre-creator template sharepic, read from its legacy props. */
export function legacySharepicText(props: Record<string, unknown> | undefined): string {
  if (!props) return '';
  return LEGACY_TEXT_KEYS.map((key) => props[key])
    .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
    .map((v) => v.trim())
    .join(' ');
}

/**
 * The `vorlage:` token's id, checked against the person's country catalogue —
 * the token is user-typed text, so an unknown or foreign id drafts freely.
 */
function resolveVorlage(
  id: string | null | undefined,
  locale: 'de-DE' | 'de-AT'
): SharepicVorlage | null {
  if (!id) return null;
  const vorlage = getSharepicVorlage(id);
  if (vorlage?.locale === locale) return vorlage;
  log.warn(`[ChatGraph] Sharepic-Vorlage "${id}" not in the ${locale} catalogue — drafting freely`);
  return null;
}

export interface SharepicGeneration {
  variants: SharepicVariant[];
  /** The content limit a failed creator draft kept breaking, or an unchanged revision. */
  failure: SharepicTurnFailure | null;
}

const failed = (failure: SharepicTurnFailure | null = null): SharepicGeneration => ({
  variants: [],
  failure,
});

/**
 * Emits its own `sharepic_complete` (including error payloads) and returns the
 * variants ([] on failure) so callers never have to duplicate the SSE handling.
 */
export async function runSharepicGeneration(opts: {
  state: ChatGraphState;
  sse: SSEWriter;
  threadId?: string | null;
  sharepicRefinement?: { instruction: string; prior: PriorSharepic };
  /** The person's own message when the last one was injected by the loop's planner. */
  request?: string;
}): Promise<SharepicGeneration> {
  const { state, sse } = opts;
  try {
    const lastMsg = state.messages?.[state.messages.length - 1];
    const rawText = lastMsg ? extractTextContent(lastMsg.content) : '';
    const locale = state.userLocale === 'de-AT' ? 'de-AT' : 'de-DE';
    const vorlage = resolveVorlage(state.sharepicVorlageId, locale);
    // The history carries the Vorlage's token as "@Titel" — a label, not topic.
    const messageText = (vorlage ? rawText.split(`@${vorlage.titel}`).join(' ') : rawText)
      .replace(/@sharepic\b/gi, '')
      .trim();
    // A picked Vorlage is a fresh sharepic in its layout, never an edit of the last card.
    const refinement = vorlage ? undefined : opts.sharepicRefinement;
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

    let variant: SharepicVariant;
    if (refinement && priorCreatorSpec && !asksForAlternative(refinement.instruction)) {
      variant = await reviseCreatorSharepic({
        instruction: refinement.instruction,
        prior: refinement.prior,
        spec: priorCreatorSpec,
        userId: state.agentConfig?.userId ?? null,
      });
      const revised = parseSharepicChatProps(variant.initialProps)?.creatorSpec;
      if (revised && isDeepStrictEqual(revised, priorCreatorSpec)) {
        sse.send('sharepic_complete', {
          message: ARTIFACT_CONFIRMATION_TEXTS.sharepicUnchanged,
          variants: [],
          error: 'Sharepic unchanged',
        });
        return failed('unchanged');
      }
    } else {
      // A fresh draft. "Eine andere Variante": the previous creator draft goes
      // along as the layout to avoid, and its texts keep the topic.
      const wantsAlternative = asksForAlternative(refinement?.instruction ?? messageText);
      const prior = !wantsAlternative
        ? null
        : (refinement?.prior ??
          (opts.threadId ? await getLastSharepicVariant(opts.threadId) : null));
      const avoid = prior ? (parseSharepicChatProps(prior.props)?.creatorSpec ?? null) : null;
      const priorText = avoid ? firstSlideText(avoid) : legacySharepicText(refinement?.prior.props);
      const brief =
        refinement && priorText
          ? `${refinement.instruction}\n\nThema wie beim vorigen Sharepic: ${priorText}`
          : topicText;
      // Form and slide count come from the person's words, never the planner's rewrite.
      const ownWords = refinement?.instruction ?? opts.request ?? messageText;
      const form = namedSharepicForm(ownWords);
      // „Eine andere Variante“ keeps the design of the draft it replaces; an
      // active Grüne Jugend role drafts in the GJ design unless named otherwise.
      const brand = avoid
        ? (avoid.brand ?? null)
        : (requestedBrand(ownWords) ??
          (grueneJugendRoleLocale(state.activeRole) ? 'gruene-jugend' : null));
      variant = await createCreatorSharepic({
        brief,
        background,
        avoid,
        locale,
        brand,
        userId: state.agentConfig?.userId ?? null,
        form,
        // "Eine andere Variante" of a carousel may stay one.
        oneSlide: wantsOneSlide(ownWords, form) && !(avoid && avoid.slides.length > 1),
        vorlage,
      });
    }
    sse.send('sharepic_complete', { message: 'Sharepic entworfen', variants: [variant] });
    return { variants: [variant], failure: null };
  } catch (error) {
    if (error instanceof DraftFailedError) {
      log.warn(`[ChatGraph] Sharepic draft failed: ${error.message}`);
      // The client shows `message`, not `error`.
      const hint = opts.sharepicRefinement
        ? draftFailedText(
            'Die Überarbeitung ist nicht gelungen.',
            error,
            'Formuliere die Änderung etwas genauer und versuch es noch einmal.'
          )
        : draftFailedText(
            'Der Entwurf ist nicht gelungen.',
            error,
            'Formuliere den Auftrag etwas genauer und versuch es noch einmal.'
          );
      sse.send('sharepic_complete', {
        message: hint,
        variants: [],
        error: 'Sharepic draft failed',
      });
      return failed(error.reason);
    }
    log.error('[ChatGraph] Sharepic variant generation failed:', error);
    sse.send('sharepic_complete', {
      message: 'Sharepic-Erstellung fehlgeschlagen',
      variants: [],
      error: toUserFacingMessage(error, 'Unknown error'),
    });
    return failed();
  }
}
