/**
 * The handler branches that can own the whole turn before the response stage.
 *
 * Order is the contract here, and every branch documents why it sits where it
 * does: social-post text edit → sharepic edit → sharepic refinement. Several of them share an
 * EDIT_NOUN_PATTERN, so moving one past another silently rehomes turns.
 *
 * Each branch either declines (falls through) or writes the whole SSE response
 * itself, which is what `handled: true` reports back to the router.
 */

import { parseSharepicChatProps } from '@gruenerator/contracts';

import { createLogger } from '../../../utils/logger.js';
import { orderMayMeanArtifact, orderText } from '../services/orderText.js';
import {
  isSharepicModeEdit,
  looksLikeSharepicOrder,
  sharepicEditAddressed,
} from '../services/sharepicEditHeuristics.js';
import {
  handleSharepicEdit,
  isSharepicEditInstruction,
  namesSharepicTarget,
  threadHasSharepic,
} from '../services/sharepicEditService.js';
import {
  getLastSharepicVariant,
  getSharepicVariantInWindow,
  isSharepicRefinement,
  type PriorSharepic,
} from '../services/sharepicVariantHelpers.js';
import {
  handleSocialPostTextEdit,
  isSocialTextEditInstruction,
  namesSocialPostTarget,
  socialPostEditAddressed,
} from '../services/socialPostEditService.js';
import { type SSEWriter } from '../services/sseHelpers.js';

import {
  type CleanupPending,
  type InitialState,
  type MaybeHandled,
  type StreamBody,
} from './types.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { StreamContext } from '../services/streamContext.js';
import type { Request } from 'express';

const log = createLogger('chatGraphContractRouter');

/**
 * A creator sharepic is revised by redrafting its spec, never by template ops.
 * A named card is revised as named — the open card follows its revisions, so an
 * older one was picked on purpose; a name outside the window is no creator
 * target, so a legacy card there still reaches `handleSharepicEdit`.
 */
export async function creatorRevisionTarget(
  threadId: string,
  variantId: string | null
): Promise<PriorSharepic | null> {
  const prior = variantId
    ? await getSharepicVariantInWindow(threadId, variantId)
    : await getLastSharepicVariant(threadId, null);
  return prior && parseSharepicChatProps(prior.props) ? prior : null;
}

const SHAREPIC_CONTEXT_MAX = 4000;

/**
 * Sharepic-Modus: ein Turn, den keine
 * Bearbeitungstür nimmt („Passt die Farbe zu unserem CD?"), bekommt die Spec
 * der offenen Karte. Live 11.10.2026 riet das Modell sonst Farbe und Text aus
 * dem Verlauf — und behauptete Änderungen, die nie stattfanden.
 */
export async function buildSharepicContextBlock(
  threadId: string,
  variantId: string
): Promise<string | null> {
  const prior = await creatorRevisionTarget(threadId, variantId);
  const props = prior ? parseSharepicChatProps(prior.props) : null;
  if (!props) return null;
  return [
    'Aktives Sharepic (Sharepic-Modus) — Inhalt und Gestaltung der offenen Karte als Spec:',
    JSON.stringify(props.creatorSpec).slice(0, SHAREPIC_CONTEXT_MAX),
    'In diesem Turn wurde daran nichts geändert.',
  ].join('\n');
}

/** A follow-up edit right after a sharepic, seeded with the previous one. */
export interface SharepicRefinement {
  instruction: string;
  prior: PriorSharepic;
}

export interface EarlyHandlerStageParams {
  sse: SSEWriter;
  req: Request;
  classifiedState: ChatGraphState;
  initialState: InitialState;
  cleanupPending: CleanupPending;
  actualThreadId: string | undefined;
  userId: string;
  lastUserMessage: StreamContext['lastUserMessage'];
  lastUserTextNoMentions: string;
  imageAttachments: StreamContext['imageAttachments'];
  /** @bildbearbeiten — keeps every edit branch out of the way of a turn the
   *  user explicitly aimed at the image editor. */
  universalEditForced: boolean;
  rawCurrentSharepic: StreamBody['currentSharepic'];
  rawCurrentSocialPost: StreamBody['currentSocialPost'];
}

export interface EarlyHandlerStageOutput {
  /** Set when the refinement branch claimed the turn — it pins `sharepic` and
   *  hands the prior variant to the generator. */
  sharepicRefinement: SharepicRefinement | undefined;
  /** True when a branch pinned the intent (only the refinement does). */
  forcedTool: boolean;
}

export async function runEarlyHandlerStage({
  sse,
  req,
  classifiedState,
  initialState,
  cleanupPending,
  actualThreadId,
  userId,
  lastUserMessage,
  lastUserTextNoMentions,
  imageAttachments,
  universalEditForced,
  rawCurrentSharepic,
  rawCurrentSocialPost,
}: EarlyHandlerStageParams): Promise<MaybeHandled<EarlyHandlerStageOutput>> {
  let forcedTool = false;
  // Was der Turn direkt davor gebaut hat — der Adressat, den jede
  // Bearbeitungs-Weiche unten fragt (siehe `priorTurnEditables`).
  const lastTurnEditables = initialState.lastTurnEditables ?? [];
  const lastTurnSharepic = lastTurnEditables.includes('sharepic');

  // === Social post TEXT edit (EXPERIMENTAL) ===
  // "Mach den Text knackiger" on a thread with a combined post edits the
  // PROSE, not the graphic. Must run BEFORE the sharepic edit branch: its
  // EDIT_NOUN_PATTERN contains `text`, so it would hijack these
  // instructions. Precedence: a plain Sharepic-Modus (rawCurrentSharepic
  // WITHOUT an activated post) wins — but when the user activated the
  // combined post (rawCurrentSocialPost, which may set both), text-ish
  // instructions edit the post and sharepic-noun instructions still fall
  // through to the sharepic path. Declines (returns false) when the
  // thread has no editable post.
  if (
    actualThreadId &&
    lastUserMessage &&
    imageAttachments.length === 0 &&
    classifiedState.intent !== 'image_edit' &&
    !universalEditForced &&
    (rawCurrentSocialPost != null || rawCurrentSharepic == null)
  ) {
    const editText = lastUserTextNoMentions.trim();
    const editOrder = orderText(editText);
    // Bringt die Nachricht Stoff mit, kann ein Auftrag ohne Ziel („übersetze
    // das", „kürzer bitte") den Stoff meinen statt des Posts — dann nur, wenn er
    // den Post nennt oder ihn ersetzt (#3918, `orderMayMeanArtifact`).
    //
    // Und nur mit Adressat (Karte, Post im Turn davor, oder der Auftrag nennt
    // ihn): `findSocialPost` findet sonst den Post von vor zehn Turns
    // (Beta-Audit 30.09.2026).
    if (
      editText &&
      isSocialTextEditInstruction(editOrder) &&
      orderMayMeanArtifact(editText, namesSocialPostTarget) &&
      socialPostEditAddressed(editOrder, {
        cardOpen: rawCurrentSocialPost != null,
        lastTurnPost: lastTurnEditables.includes('social_post'),
      })
    ) {
      // Sibling of the sharepic-branch log below: the two edit branches are
      // where a follow-up either lands correctly or is silently misread.
      log.info(
        `[ChatGraph] social post text-edit branch: ${JSON.stringify(editText.slice(0, 80))}`
      );
      const handled = await handleSocialPostTextEdit({
        sse,
        threadId: actualThreadId,
        userId,
        instruction: editText,
        postId: rawCurrentSocialPost?.postId ?? null,
        startTime: initialState.startTime,
        ...(classifiedState.classificationTimeMs != null && {
          classificationTimeMs: classifiedState.classificationTimeMs,
        }),
      });
      if (handled) {
        await cleanupPending(true);
        return { handled: true, result: { status: 200 as const, body: undefined } };
      }
    }
  }

  // === Sharepic edit: full NL editing of an existing chat sharepic ===
  // "Zeile 2 kürzer", "Balken nach oben", "anderes Hintergrundbild" on a
  // sharepic the thread already produced. Applies structured operations to
  // the (lazily minted) canvas document and updates the card in place —
  // see sharepicEditService. Falls through to the legacy text-regeneration
  // refinement below when no editable target exists.
  if (
    actualThreadId &&
    lastUserMessage &&
    imageAttachments.length === 0 &&
    classifiedState.intent !== 'image_edit' &&
    !universalEditForced
  ) {
    const editText = lastUserTextNoMentions.replace(/@sharepic\b/gi, ' ').trim();
    const editOrder = orderText(editText);
    // Wie beim Post: mit eingefügtem Stoff nur, wenn der Auftrag das Sharepic
    // nennt oder ersetzt (#3918).
    const candidate =
      !editText || !orderMayMeanArtifact(editText, namesSharepicTarget)
        ? null
        : isSharepicEditInstruction(editOrder)
          ? 'edit-instruction'
          : isSharepicRefinement(editOrder)
            ? 'refinement'
            : rawCurrentSharepic != null && isSharepicModeEdit(editOrder)
              ? 'sharepic-mode'
              : null;
    // BOTH lanes must prove there is something to edit. `refinement` always
    // did; `edit-instruction` never did, and that asymmetry was a hole, not
    // a nuance: on a thread with no sharepic the handler declined, the turn
    // fell through, and the pipeline then CREATED a sharepic about the edit
    // instruction ("Mach den Text im Sharepic größer" became a sharepic
    // whose topic was that sentence). One check, both lanes.
    //
    // Existenz allein reicht nicht: der Auftrag braucht einen ADRESSATEN (offene
    // Karte, Sharepic im Turn davor, oder er nennt es) — sonst wird Tage später
    // „Mach mir eine Liste der Argumente" zur Sharepic-Bearbeitung. Gelesen
    // VOR dem Entfernen von „@sharepic": die Erwähnung nennt das Ziel.
    const sharepicTrigger =
      candidate &&
      sharepicEditAddressed(orderText(lastUserTextNoMentions), {
        cardOpen: rawCurrentSharepic != null,
        lastTurnSharepic,
      }) &&
      (rawCurrentSharepic != null || (await threadHasSharepic(actualThreadId)))
        ? candidate
        : null;
    if (sharepicTrigger) {
      // WHICH rule captured the turn, and on what text. This branch can end
      // a turn early (e.g. the "Welche Variante soll ich bearbeiten?"
      // clarification) without any other log line, so a message that was
      // never meant as a sharepic edit vanished into it leaving no trace —
      // a QA report of "my question was answered as an edit command" was
      // not diagnosable from the backend at all.
      log.info(
        `[ChatGraph] sharepic edit branch via ${sharepicTrigger}: ${JSON.stringify(editText.slice(0, 80))}`
      );
      const creatorPrior = await creatorRevisionTarget(
        actualThreadId,
        rawCurrentSharepic?.variantId ?? null
      );
      if (creatorPrior) {
        classifiedState.intent = 'sharepic';
        return {
          handled: false,
          sharepicRefinement: { instruction: editText, prior: creatorPrior },
          forcedTool: true,
        };
      }
      const handled = await handleSharepicEdit({
        sse,
        req,
        threadId: actualThreadId,
        userId,
        instruction: editText,
        currentSharepic: rawCurrentSharepic ?? null,
        startTime: initialState.startTime,
        ...(classifiedState.classificationTimeMs != null && {
          classificationTimeMs: classifiedState.classificationTimeMs,
        }),
      });
      if (handled) {
        await cleanupPending(true);
        return { handled: true, result: { status: 200 as const, body: undefined } };
      }
    }
  }

  // === Sharepic refinement: a follow-up edit right after a sharepic ===
  // "verlängern" / "kürzer" / "anderes Bild" after a sharepic means "adjust
  // the one you just made" — regenerate seeded with the previous sharepic's
  // text, not a fresh sharepic about the word "verlängern". Overrides whatever
  // intent the classifier picked (the edit verb alone rarely classifies as
  // sharepic). Skipped when an image is attached (that's image_edit territory).
  // Creator sharepics already branch into this refinement from the edit branch
  // above; this block is reached when handleSharepicEdit declined: no target
  // variant, or a template with no descriptor (the narrow case).
  let sharepicRefinement: SharepicRefinement | undefined;
  if (
    actualThreadId &&
    lastUserMessage &&
    imageAttachments.length === 0 &&
    classifiedState.intent !== 'image_edit' &&
    !universalEditForced
  ) {
    const followText = lastUserTextNoMentions;
    const followOrder = orderText(followText);
    if (
      isSharepicRefinement(followOrder) &&
      orderMayMeanArtifact(followText, namesSharepicTarget) &&
      // Derselbe Adressat wie oben: `getLastSharepicVariant` findet das Sharepic
      // noch 30 Nachrichten später, und „Ist das im Wahlprogramm anders?" wurde
      // so zur Neufassung des Sharepics (Beta-Audit 30.09.2026).
      sharepicEditAddressed(followOrder, {
        cardOpen: rawCurrentSharepic != null,
        lastTurnSharepic,
      })
    ) {
      const prior = await getLastSharepicVariant(actualThreadId);
      if (prior) {
        sharepicRefinement = {
          instruction: followText.replace(/@sharepic\b/gi, '').trim(),
          prior,
        };
        classifiedState.intent = 'sharepic';
        forcedTool = true;
        log.info(
          `[ChatGraph] Sharepic refinement: "${sharepicRefinement.instruction}" on ${prior.canvasType}`
        );
      }
    }
  }

  // Ein Auftrag ans Sharepic („Prüf das Sharepic") gehört den Loop-Werkzeugen
  // (read/edit/check_sharepic). Mit der Spec als Material hielt der Router ihn
  // für einen Schreibauftrag mit Stoff und blieb im Single-Pass, ohne Werkzeuge.
  if (
    !sharepicRefinement &&
    rawCurrentSharepic != null &&
    actualThreadId &&
    !looksLikeSharepicOrder(orderText(lastUserTextNoMentions))
  ) {
    const sharepicContext = await buildSharepicContextBlock(
      actualThreadId,
      rawCurrentSharepic.variantId
    );
    if (sharepicContext) {
      classifiedState.attachmentContext = classifiedState.attachmentContext
        ? `${classifiedState.attachmentContext}\n\n${sharepicContext}`
        : sharepicContext;
      initialState.attachmentContext = classifiedState.attachmentContext;
    }
  }
  return { handled: false, sharepicRefinement, forcedTool };
}
