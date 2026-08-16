/**
 * EXPERIMENTAL `social_post` — the post text and, only when explicitly asked
 * for, a sharepic beside it. Both halves run in parallel behind one gate.
 */

import { buildCitations, searchNode } from '../../../../agents/langgraph/ChatGraph/index.js';
import { hasExplicitSharepicWord } from '../../../../agents/langgraph/ChatGraph/nodes/fastPathGuards.js';
import { createLogger } from '../../../../utils/logger.js';
import { extractTextContent } from '../messageHelpers.js';
import { looksLikeRefusal } from '../refusalDetection.js';
import { createDeferredSSE } from '../sseHelpers.js';

import { runSharepicGeneration } from './sharepic.js';

import type {
  ChatGraphState,
  SocialPostPayload,
} from '../../../../agents/langgraph/ChatGraph/types.js';
import type { SharepicVariant } from '../sharepicVariantHelpers.js';
import type { SSEWriter } from '../sseHelpers.js';
import type { Request } from 'express';

const log = createLogger('ChatGraphController');

export async function runSocialPostBranch(opts: {
  state: ChatGraphState;
  sse: SSEWriter;
  forcedTool: boolean;
  enabledTools?: Record<string, boolean> | undefined;
  req?: Request | undefined;
  threadId: string | null;
}): Promise<{
  state: ChatGraphState;
  /** `null` = the sharepic half rejected; the loop keeps whatever it had. */
  sharepicVariants: SharepicVariant[] | null;
  socialPost: SocialPostPayload | null;
  socialPostRefused: boolean;
  socialPostRefusalIsPolicy: boolean;
}> {
  const { sse, forcedTool, enabledTools } = opts;
  let finalState = opts.state;

  // A post is TEXT ONLY unless the user named a sharepic ("Post mit
  // Sharepic"). Producing a branded graphic for every "schreib einen
  // Insta-Post zu X" was the largest source of sharepics nobody asked for.
  // When a sharepic IS wanted, both halves run in parallel and each emits
  // its SSE event as soon as it resolves (text usually lands first, so the
  // card shows it while thumbnails render).
  //
  // Read from finalState.messages, not from the router's
  // lastUserTextNoMentions: the resume path appends the answered
  // clarification as a NEW user message (resumePipeline), so the original
  // "mit Sharepic" wording is still the last user turn there and that path
  // needs no separate handling.
  const sharepicToolAllowed = forcedTool || enabledTools?.['sharepic'] !== false;
  const lastUserMsg = [...finalState.messages].reverse().find((m) => m.role === 'user');
  const wantsSharepic =
    sharepicToolAllowed &&
    hasExplicitSharepicWord(lastUserMsg ? extractTextContent(lastUserMsg.content) : '');
  sse.send('image_start', {
    message: wantsSharepic ? 'Texte und gestalte deinen Post...' : 'Texte deinen Post...',
  });

  // The sharepic half streams `sharepic_complete` itself, so its output is
  // buffered until the text half is known: a graphic must never ship when
  // the text model refused the request (live: an invented Kickl quote with
  // an invented ORF source rendered in party design while the text said
  // "I'm sorry, but I can't help with that"). Buffering keeps both halves
  // parallel — the gate costs no latency, only revocability.
  const sharepicBuffer = createDeferredSSE();
  const postBuffer = createDeferredSSE();
  const sharepicHalf: Promise<SharepicVariant[]> = wantsSharepic
    ? runSharepicGeneration({
        state: finalState,
        sse,
        req: opts.req,
        threadId: opts.threadId,
        emitTo: sharepicBuffer,
      })
    : Promise.resolve([]);

  const stateForText = finalState;
  const textHalf: Promise<{
    state: ChatGraphState;
    post: SocialPostPayload;
  }> = (async () => {
    // Pasted URLs must ground the text ("schreib einen Tweet zu <URL>"),
    // so crawl them HERE, before generation — the secondary-intent loop
    // iteration would run only after the text already exists (it is
    // skipped for social_post, see intentsToExecute in pipeline.ts).
    let urlContext: ChatGraphState['searchResults'] = [];
    if ((stateForText.detectedUrls?.length ?? 0) > 0) {
      try {
        const scrape = await searchNode({
          ...stateForText,
          intent: 'scrape_url',
        } as ChatGraphState);
        urlContext = scrape.searchResults ?? [];
      } catch (error) {
        log.warn(`[ChatGraph] social_post URL crawl failed: ${error}`);
      }
    }
    // Ground the text on real posts (same retrieval as `examples`) —
    // unless the agent/user disabled the examples tool; the composer
    // prompt handles zero examples ("Keine Vorlagen verfügbar"). A
    // failed search degrades the same way.
    let textState = stateForText;
    const examplesEnabled = forcedTool || enabledTools?.['examples'] !== false;
    if (examplesEnabled) {
      try {
        const searchResult = await searchNode(stateForText);
        textState = { ...stateForText, ...searchResult } as ChatGraphState;
      } catch (error) {
        log.warn(`[ChatGraph] social_post examples search failed: ${error}`);
      }
    }
    if (urlContext.length > 0) {
      // Keep crawled pages on state too so citations persist with the turn.
      textState = {
        ...textState,
        searchResults: [...(textState.searchResults ?? []), ...urlContext],
        citations: [...(textState.citations ?? []), ...buildCitations(urlContext)],
      } as ChatGraphState;
    }
    const { generateSocialPostText } = await import('../socialPostService.js');
    const post = await generateSocialPostText({
      state: textState,
      urlContext,
      ...(opts.req && { req: opts.req }),
    });
    postBuffer.send('social_post_complete', {
      message: `${post.platform === 'generic' ? 'Social-Media' : post.platform}-Post erstellt`,
      post,
    });
    return { state: textState, post };
  })();

  const [variantsSettled, textSettled] = await Promise.allSettled([sharepicHalf, textHalf]);

  // The gate: a refusal from the text model invalidates the whole turn, not
  // just its own half. Both buffers are dropped so no graphic, no download
  // button and no success copy survive the refusal.
  const refusedText =
    textSettled.status === 'fulfilled' && looksLikeRefusal(textSettled.value.post.text);
  // WHY the text model declined is not something `looksLikeRefusal` can
  // tell us — it only sees that it declined. The sharepic half ran the SAME
  // request through its own ABLEHNUNG channel, so its outcome is the one
  // piece of evidence available: both halves declining is a policy problem,
  // while a text-only decline beside working variants is usually a broken
  // task (live: an unresolvable "Jetzt eine Version davon auf Englisch."
  // made the composer answer "ich kann keinen Post erstellen …", which was
  // then shown to the user as a refusal about FABRICATED QUOTES — a reason
  // that had nothing to do with the request).
  //
  // The gate itself does NOT change: both halves are discarded either way,
  // because a text refusal beside a rendered sharepic is exactly the
  // disinformation case this was built for. Only the explanation adapts to
  // what is actually known.
  //
  // No sharepic half ⇒ no second opinion on the same request ⇒ no evidence
  // that this was a policy decision. `wantsSharepic` is load-bearing here:
  // without it a text-only post would report EVERY refusal as a fabricated
  // quote, which is precisely the false accusation described above.
  const sharepicAlsoDeclined =
    wantsSharepic && (variantsSettled.status !== 'fulfilled' || variantsSettled.value.length === 0);
  let socialPostRefused = false;
  let socialPostRefusalIsPolicy = false;
  if (refusedText) {
    log.warn(
      `[ChatGraph] social_post: text model refused — discarding sharepic variants and post ` +
        `(sharepicAlsoDeclined=${sharepicAlsoDeclined})`
    );
    sharepicBuffer.discard();
    postBuffer.discard();
    socialPostRefused = true;
    socialPostRefusalIsPolicy = sharepicAlsoDeclined;
    sse.send('social_post_complete', {
      message: sharepicAlsoDeclined ? 'Anfrage abgelehnt' : 'Post nicht erstellt',
      error: sharepicAlsoDeclined
        ? 'Diese Anfrage kann ich nicht umsetzen — dabei entstünde ein erfundenes Zitat oder eine irreführende Aussage im Namen der Partei.'
        : 'Daraus konnte ich keinen Post erzeugen. Sag mir bitte konkret, worum es gehen soll — oder worauf du dich beziehst.',
    });
  } else {
    sharepicBuffer.flush(sse);
    postBuffer.flush(sse);
  }

  let sharepicVariants: SharepicVariant[] | null = null;
  if (variantsSettled.status === 'fulfilled') {
    sharepicVariants = refusedText ? [] : variantsSettled.value;
  } else if (!refusedText) {
    // Mirror the text half below: without this the sharepic simply never
    // arrived and the turn reported success with only the post text.
    log.error('[ChatGraph] social_post sharepic generation failed:', variantsSettled.reason);
    sse.send('sharepic_complete', {
      message: 'Sharepic konnte nicht erstellt werden',
      variants: [],
      error: 'Das Sharepic konnte nicht erstellt werden — der Text steht trotzdem bereit.',
    });
  }
  let socialPost: SocialPostPayload | null = null;
  if (textSettled.status === 'fulfilled') {
    // A refusal is not a post: leaving it on state would persist it as one
    // and make the router's confirmation line promise a post that isn't there.
    socialPost = refusedText ? null : textSettled.value.post;
    // Keep the examples retrieval on state so persistence/citations work
    // like the examples flow.
    finalState = {
      ...textSettled.value.state,
      ...(socialPost && { socialPostResult: socialPost }),
    } as ChatGraphState;
  } else {
    log.error('[ChatGraph] social_post text generation failed:', textSettled.reason);
    sse.send('social_post_complete', {
      message: 'Post-Text konnte nicht erstellt werden',
      error: textSettled.reason instanceof Error ? textSettled.reason.message : 'Unknown error',
    });
  }

  return {
    state: finalState,
    sharepicVariants,
    socialPost,
    socialPostRefused,
    socialPostRefusalIsPolicy,
  };
}
