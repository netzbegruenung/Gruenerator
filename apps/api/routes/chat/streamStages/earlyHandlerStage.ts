/**
 * The handler branches that can own the whole turn before the response stage.
 *
 * Order is the contract here, and every branch documents why it sits where it
 * does: reel upload → reel edit → app gate → reel context → social-post text
 * edit → sharepic edit → sharepic refinement. Several of them share an
 * EDIT_NOUN_PATTERN, so moving one past another silently rehomes turns.
 *
 * Each branch either declines (falls through) or writes the whole SSE response
 * itself, which is what `handled: true` reports back to the router.
 */

import { createLogger } from '../../../utils/logger.js';
import { extractTextContent } from '../services/messageHelpers.js';
import { APP_REDIRECT_TEXTS } from '../services/platformGating.js';
import {
  buildReelContextBlock,
  handleReelEdit,
  hasReelEditVerb,
  isReelEditInstruction,
} from '../services/reelEditService.js';
import {
  handleSharepicAgenticEdit,
  isChatToolLoopEnabled,
} from '../services/sharepicAgenticService.js';
import { hasSharepicEditVerb, isShortAffirmation } from '../services/sharepicEditHeuristics.js';
import {
  handleSharepicEdit,
  isSharepicEditInstruction,
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
} from '../services/socialPostEditService.js';
import { type SSEWriter } from '../services/sseHelpers.js';

import { finishTurnWithFixedText, type FixedTextBase } from './turnEnd.js';
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
  fixedTextBase: FixedTextBase;
  actualThreadId: string | undefined;
  userId: string;
  aiClient: StreamContext['aiClient'];
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
  fixedTextBase,
  actualThreadId,
  userId,
  aiClient,
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
    const reelModeRelaxed = rawCurrentReel != null && !!reelText && hasReelEditVerb(reelText);
    if (reelText && (isReelEditInstruction(reelText) || reelModeRelaxed)) {
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

  // === App gate: sharepic UI is web-only ===
  // The app renders neither sharepic_complete nor the combined-post card,
  // so these turns would generate into the void. Placed before the edit/
  // refinement branches and BOTH HITL interrupts — an interrupt stored
  // with a sharepic intent would resume past this gate (resumePipeline
  // has no platform check). social_post degrades to its text-only
  // sibling intent instead of a redirect: the post text is a plain chat
  // answer the app renders fine.
  if (initialState.clientPlatform === 'app') {
    if (
      classifiedState.secondaryIntent === 'sharepic' ||
      classifiedState.secondaryIntent === 'social_post'
    ) {
      classifiedState.secondaryIntent = null;
    }
    if (classifiedState.intent === 'social_post') {
      classifiedState.intent = 'examples';
      log.info('[ChatGraph] social_post on app — downgraded to examples (text-only post)');
    }
    if (classifiedState.intent === 'sharepic') {
      log.info('[ChatGraph] Sharepic intent on app — redirecting to web');
      return {
        handled: true,
        result: await finishTurnWithFixedText({
          ...fixedTextBase,
          text: APP_REDIRECT_TEXTS.sharepic,
          intent: 'sharepic',
        }),
      };
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
  // thread has no editable post. Skipped on the app, which can't render
  // the combined-post card or its update events.
  if (
    initialState.clientPlatform !== 'app' &&
    actualThreadId &&
    lastUserMessage &&
    imageAttachments.length === 0 &&
    classifiedState.intent !== 'image_edit' &&
    !universalEditForced &&
    (rawCurrentSocialPost != null || rawCurrentSharepic == null)
  ) {
    const editText = lastUserTextNoMentions.trim();
    if (editText && isSocialTextEditInstruction(editText)) {
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
  // refinement below when no editable target exists. Skipped on the app,
  // which can't render sharepic updates — edit-y phrases there run through
  // the normal pipeline instead.
  if (
    initialState.clientPlatform !== 'app' &&
    actualThreadId &&
    lastUserMessage &&
    imageAttachments.length === 0 &&
    classifiedState.intent !== 'image_edit' &&
    !universalEditForced
  ) {
    const editText = lastUserTextNoMentions.replace(/@sharepic\b/gi, ' ').trim();
    // With an explicitly activated sharepic (Sharepic-Modus) AND the tool
    // loop on, an edit verb alone is enough — the loop can answer with
    // plain text when the message turns out not to be sharepic-related,
    // so over-triggering is cheap. The strict verb+noun check stays the
    // bar for the tool-forced single-call path.
    const sharepicModeRelaxed =
      isChatToolLoopEnabled() &&
      rawCurrentSharepic != null &&
      !!editText &&
      (hasSharepicEditVerb(editText) || isShortAffirmation(editText));
    const candidate = !editText
      ? null
      : isSharepicEditInstruction(editText)
        ? 'edit-instruction'
        : isSharepicRefinement(editText)
          ? 'refinement'
          : sharepicModeRelaxed
            ? 'sharepic-mode-relaxed'
            : null;
    // EVERY lane must prove there is something to edit. `refinement` always
    // did; `edit-instruction` never did, and that asymmetry was a hole, not
    // a nuance: on a thread with no sharepic the handler declined, the turn
    // fell through, and the pipeline then CREATED a sharepic about the edit
    // instruction ("Mach den Text im Sharepic größer" became a sharepic
    // whose topic was that sentence). One check, all three lanes.
    // sharepicModeRelaxed keeps its own rawCurrentSharepic requirement —
    // an explicitly activated sharepic is stronger evidence than "the
    // thread has one somewhere".
    const sharepicTrigger =
      candidate && (rawCurrentSharepic != null || (await threadHasSharepic(actualThreadId)))
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
      // CHAT_TOOL_LOOP swaps the executor, not the routing: same entry
      // condition and fallthrough semantics, but the edit runs as a small
      // agentic tool loop instead of one structured call.
      const editHandler = isChatToolLoopEnabled() ? handleSharepicAgenticEdit : handleSharepicEdit;
      const handled = await editHandler({
        sse,
        req,
        threadId: actualThreadId,
        userId,
        instruction: editText,
        currentSharepic: rawCurrentSharepic ?? null,
        aiClient,
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
    initialState.clientPlatform !== 'app' &&
    actualThreadId &&
    lastUserMessage &&
    imageAttachments.length === 0 &&
    classifiedState.intent !== 'image_edit' &&
    !universalEditForced
  ) {
    const followText = lastUserTextNoMentions;
    if (isSharepicRefinement(followText)) {
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
