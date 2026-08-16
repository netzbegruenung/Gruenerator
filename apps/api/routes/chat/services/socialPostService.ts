/**
 * Social Post Service (EXPERIMENTAL)
 *
 * Text half of the combined `social_post` intent: generates the platform
 * post one-shot via the AI worker pool, grounded on the social examples that
 * searchNode already put on state (same rubric/prompt machinery as the
 * `examples` flow via buildSocialMediaSystemPrompt). The sharepic half runs
 * in parallel through the existing sharepic variant pipeline.
 *
 * One-shot instead of token-streamed by design: the result is a structured
 * payload for the SocialPostCard, not the message text. Streaming the text
 * into the card via a `social_post_delta` event is a possible later
 * enhancement.
 */

import { randomUUID } from 'node:crypto';

import { SOCIAL_PLATFORM_INFO, type SocialPostPayload } from '@gruenerator/contracts';

import { buildSocialMediaSystemPrompt } from '../../../agents/langgraph/ChatGraph/nodes/socialMediaComposerNode.js';
import { aiText } from '../../../services/ai/generate.js';
import { createLogger } from '../../../utils/logger.js';

import { extractTextContent } from './messageHelpers.js';
import { looksLikeToolCallLeak } from './outputSanity.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';

const log = createLogger('SocialPostService');

const HASHTAG_PATTERN = /#[^\s#.,;!?()[\]{}"']+/g;

/**
 * Deterministic post-processing of the LLM output. No JSON round-trip —
 * emojis/newlines make structured output fragile; the prompt already demands
 * "nur der fertige Post inklusive Hashtags".
 */
export function parseSocialPostText(raw: string): {
  text: string;
  hashtags: string[];
  charCount: number;
} {
  // Strip code fences and lead-in/meta lines some models still emit.
  let text = raw.trim();
  const fenced = text.match(/^```(?:\w+)?\n([\s\S]*?)\n```$/);
  if (fenced?.[1]) text = fenced[1].trim();
  text = text.replace(/^(hier ist (dein|der) post[^\n]*|dein post:)\s*\n+/i, '').trim();

  const hashtags = Array.from(new Set(text.match(HASHTAG_PATTERN) ?? []));
  return { text, hashtags, charCount: text.length };
}

/**
 * Format limits the user typed into their own request ("max. 500 Zeichen,
 * maximal 3 Hashtags").
 *
 * Without these the system prompt pinned the PLATFORM budget and thereby
 * CONTRADICTED the user: an Instagram request for 500 characters was answered
 * with "Hartes Maximum: 2200 Zeichen" in the system role, and the model
 * followed the system role (observed live: 765 chars, 5 hashtags for a
 * "max. 500 Zeichen, 3 Hashtags" prompt). A user limit is only accepted when it
 * is TIGHTER than the platform's — nobody may raise Twitter's 280 by asking.
 */
export function extractPostConstraints(
  userText: string,
  platformMaxChars: number
): { maxChars: number | null; maxHashtags: number | null } {
  const charMatch = userText.match(/(\d{2,4})\s*zeichen/i);
  const parsedChars = charMatch ? parseInt(charMatch[1], 10) : NaN;
  const maxChars =
    Number.isFinite(parsedChars) && parsedChars >= 50 && parsedChars < platformMaxChars
      ? parsedChars
      : null;

  const tagMatch = userText.match(/(\d{1,2})\s*hashtags?/i);
  const parsedTags = tagMatch ? parseInt(tagMatch[1], 10) : NaN;
  const maxHashtags = Number.isFinite(parsedTags) && parsedTags <= 30 ? parsedTags : null;

  return { maxChars, maxHashtags };
}

/**
 * Generate the post text for the combined social post. Expects `state` to
 * already carry the examples retrieval (examplesResult) and platform hint.
 * Throws on worker failure — the caller degrades to sharepic-only behavior.
 */
export async function generateSocialPostText(opts: {
  state: ChatGraphState;
  /** Crawled pages from URLs the user pasted — the factual basis of the post. */
  urlContext?: ChatGraphState['searchResults'];
}): Promise<SocialPostPayload> {
  const { state, urlContext } = opts;
  const platform = state.platform ?? 'generic';
  const info = SOCIAL_PLATFORM_INFO[platform];

  const lastMsg = state.messages?.[state.messages.length - 1];
  const userText = lastMsg ? extractTextContent(lastMsg.content) : '';
  if (!userText.trim()) throw new Error('Empty user message for social post generation');

  // "Schreib einen Tweet zu <URL>" — the crawled page is the factual basis.
  // Capped per page so a long article can't crowd out the rubric/examples.
  const urlBlock =
    urlContext && urlContext.length > 0
      ? `\n\n## KONTEXT AUS VERLINKTEN SEITEN\nDie*der Nutzer*in hat Link(s) mitgeschickt. Stütze den Post inhaltlich auf diese Seiteninhalte; erfinde nichts darüber hinaus.\n\n${urlContext
          .slice(0, 3)
          .map((r) => `### ${r.title}${r.url ? ` (${r.url})` : ''}\n${r.content.slice(0, 4000)}`)
          .join('\n\n---\n\n')}`
      : '';

  // Reuse the examples-grounded prompt (rubric + up to 6 worked examples),
  // then pin the shared character budget so backend prompt and frontend
  // meter can't drift. A limit from the request itself wins over the platform
  // default — otherwise the system role tells the model the opposite of what
  // the user just asked for.
  const constraints = extractPostConstraints(userText, info.maxChars);
  const hardMax = constraints.maxChars ?? info.maxChars;
  const target = constraints.maxChars ?? info.recommendedChars;
  const userLimits = [
    constraints.maxChars != null ? `höchstens ${constraints.maxChars} Zeichen` : null,
    constraints.maxHashtags != null ? `höchstens ${constraints.maxHashtags} Hashtags` : null,
  ].filter((v): v is string => v !== null);
  const userLimitBlock =
    userLimits.length > 0
      ? `\nDie*der Nutzer*in hat ausdrücklich ${userLimits.join(' und ')} verlangt. Das ist BINDEND und geht dem Plattform-Budget vor — zähle nach, bevor du antwortest.`
      : '';

  const systemPrompt = `${buildSocialMediaSystemPrompt(state)}${urlBlock}

## ZEICHENBUDGET
Ziel: ~${target} Zeichen. Hartes Maximum: ${hardMax} Zeichen (inklusive Hashtags).${userLimitBlock}
Setze nur Hashtags, die zum Thema gehören. Erfinde KEINE Orts-, Regional- oder Gliederungs-Hashtags (etwa #GrüneBerlin), wenn die Anfrage keinen Ort nennt.`;

  const startTime = Date.now();
  const content = await aiText({
    lane: 'social_post_generation',
    system: systemPrompt,
    prompt: userText,
    temperature: 0.7,
  });

  // `aiText` throws when nothing answered, but not when the model answered
  // with a tool call and no prose — that arrives as an empty string, and an
  // empty post would ship as a blank card.
  if (!content) {
    throw new Error('Social post generation returned no content');
  }

  const parsed = parseSocialPostText(content);

  // A leaked tool call is worse than no post: it ships internal prompt
  // structure into a widget the user is meant to publish from. Throwing puts
  // the turn on the existing "text half failed" path instead of rendering it.
  if (looksLikeToolCallLeak(parsed.text)) {
    log.warn(
      `[SocialPost] ${platform} composer returned a tool-call fragment instead of a post: ` +
        `${JSON.stringify(parsed.text.slice(0, 120))}`
    );
    throw new Error('Social post generation returned a tool-call fragment instead of post text');
  }

  log.info(
    `[SocialPost] Generated ${platform} post: ${parsed.charCount} chars, ` +
      `${parsed.hashtags.length} hashtags in ${Date.now() - startTime}ms`
  );

  // A format the user explicitly asked for and did NOT get is a quality signal,
  // not a fatal error — the post still ships. Logged so it is countable instead
  // of only surfacing when someone counts characters by hand in a QA pass.
  const missed = [
    parsed.charCount > hardMax ? `${parsed.charCount}/${hardMax} Zeichen` : null,
    constraints.maxHashtags != null && parsed.hashtags.length > constraints.maxHashtags
      ? `${parsed.hashtags.length}/${constraints.maxHashtags} Hashtags`
      : null,
  ].filter((v): v is string => v !== null);
  if (missed.length > 0) {
    log.warn(`[SocialPost] ${platform} post missed the requested format: ${missed.join(', ')}`);
  }

  return {
    postId: randomUUID(),
    platform,
    text: parsed.text,
    hashtags: parsed.hashtags,
    charCount: parsed.charCount,
    version: 1,
  };
}
