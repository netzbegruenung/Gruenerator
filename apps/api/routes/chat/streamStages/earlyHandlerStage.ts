/**
 * The handler branches that can own the whole turn before the response stage.
 *
 * Order is the contract here, and every branch documents why it sits where it
 * does: reel upload → reel edit → reel context → social-post text edit →
 * sharepic edit → sharepic refinement. Several of them share an
 * EDIT_NOUN_PATTERN, so moving one past another silently rehomes turns.
 *
 * Each branch either declines (falls through) or writes the whole SSE response
 * itself, which is what `handled: true` reports back to the router.
 */

import { createLogger } from '../../../utils/logger.js';
import { extractTextContent } from '../services/messageHelpers.js';
import { orderMayMeanArtifact, orderText } from '../services/orderText.js';
import {
  buildReelContextBlock,
  handleReelEdit,
  hasReelEditVerb,
  isReelEditInstruction,
  namesReelTarget,
} from '../services/reelEditService.js';
import { sharepicEditAddressed } from '../services/sharepicEditHeuristics.js';
import {
  handleSharepicEdit,
  isSharepicEditInstruction,
  namesSharepicTarget,
  threadHasSharepic,
} from '../services/sharepicEditService.js';
import {
  getLastSharepicVariant,
  isSharepicRefinement,
  type PriorSharepic,
} from '../services/sharepicVariantHelpers.js';
import {
  handleSocialPostTextEdit,
  isSocialTextEditInstruction,
  namesSocialPostTarget,
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
  rawCurrentReel: StreamBody['currentReel'];
  rawReelUpload: StreamBody['reelUpload'];
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
  rawCurrentReel,
  rawReelUpload,
  rawCurrentSharepic,
  rawCurrentSocialPost,
}: EarlyHandlerStageParams): Promise<MaybeHandled<EarlyHandlerStageOutput>> {
  let forcedTool = false;

  // === Reel upload: composer-attached video → auto-transcription ===
  // Deliberately NOT behind the image/intent guards of the edit branch
  // below: the user explicitly attached a video for subtitling, so the
  // upload wins the turn even when the message also carries an image
  // (which is ignored for this turn) or classifies as image_edit —
  // otherwise the already-TUS-uploaded video would be dropped silently.
  if (actualThreadId && lastUserMessage && rawReelUpload != null) {
    const uploadText = (extractTextContent(lastUserMessage.content) || '').trim();
    const handled = await handleReelEdit({
      sse,
      threadId: actualThreadId,
      userId,
      instruction: uploadText,
      currentReel: rawCurrentReel ?? null,
      reelUpload: rawReelUpload,
      userLocale: initialState.userLocale || 'de-DE',
      clientPlatform: initialState.clientPlatform,
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

  // === Reel edit: chat subtitle editing of subtitler projects ===
  // Two sub-flows in handleReelEdit: a reel-edit instruction without an
  // attached reel streams a project picker; with a target it runs a
  // text-only subtitle edit. Placed BEFORE the sharepic branch — its
  // noun pattern includes "text" and would otherwise capture
  // "Untertitel-Text ändern". Falls through (returns false) when no reel
  // context exists and the phrasing isn't reel-specific ("Segment 2
  // kürzen" on a sharepic thread).
  if (
    actualThreadId &&
    lastUserMessage &&
    imageAttachments.length === 0 &&
    classifiedState.intent !== 'image_edit' &&
    !universalEditForced
  ) {
    const reelText = lastUserTextNoMentions.trim();
    // Geprüft wird der Auftrag, nicht der eingefügte Stoff: „Reels … Untertiteln"
    // und „Schreibt uns" in einem Newsletter über „rechtschreibung korrigieren"
    // holten die Reel-Auswahl (#3912). Der Handler bekommt weiter alles.
    const reelOrder = orderText(reelText);
    // Die Abkürzung ohne Reel-Nomen gilt nur ohne Stoff: „kürzer bitte" unter
    // einem eingefügten Text meint den Text, nicht das offene Reel.
    const reelModeRelaxed =
      rawCurrentReel != null &&
      !!reelText &&
      hasReelEditVerb(reelOrder) &&
      orderMayMeanArtifact(reelText, namesReelTarget);
    if (reelText && (isReelEditInstruction(reelOrder) || reelModeRelaxed)) {
      const handled = await handleReelEdit({
        sse,
        threadId: actualThreadId,
        userId,
        instruction: reelText,
        currentReel: rawCurrentReel ?? null,
        reelUpload: null,
        userLocale: initialState.userLocale || 'de-DE',
        clientPlatform: initialState.clientPlatform,
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

  // === Reel context: transcript for non-edit turns ===
  // With a reel attached, every turn the edit branch did NOT claim gets
  // the subtitle transcript injected as attachment context, so the normal
  // pipeline can answer follow-ups about the video's content ("schreib
  // mir einen Insta-Post dazu", "fass das zusammen"). Reels are short —
  // a transcript is a few hundred tokens at most.
  //
  // Injected AFTER classification on purpose: pre-classify context would
  // hit the classifier's attachment branch and force `direct` intent for
  // EVERY turn in Reel-Modus, breaking web-search/sharepic requests. The
  // respond stage reads classifiedState; initialState is mutated too so
  // the HITL clarification gate below sees the context and doesn't
  // interrupt "Fass das zusammen" with a needless question.
  if (rawCurrentReel != null && userId) {
    const reelContext = await buildReelContextBlock(userId, rawCurrentReel.projectId);
    if (reelContext) {
      classifiedState.attachmentContext = classifiedState.attachmentContext
        ? `${classifiedState.attachmentContext}\n\n${reelContext}`
        : reelContext;
      initialState.attachmentContext = classifiedState.attachmentContext;
    }
  }

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
    if (
      editText &&
      isSocialTextEditInstruction(editOrder) &&
      orderMayMeanArtifact(editText, namesSocialPostTarget)
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
        lastTurnSharepic: initialState.lastTurnSharepic === true,
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
  // Reached only when handleSharepicEdit above declined: no target variant,
  // or a template with no descriptor. Since every template except
  // freeform/freeform-at and profilbild is now chat-editable, that is the
  // narrow case rather than the common one.
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
        lastTurnSharepic: initialState.lastTurnSharepic === true,
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
  return { handled: false, sharepicRefinement, forcedTool };
}
