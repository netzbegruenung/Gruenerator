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
import { createLogger } from '../../../utils/logger.js';

import { extractTextContent } from './messageHelpers.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { Request } from 'express';

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
 * Generate the post text for the combined social post. Expects `state` to
 * already carry the examples retrieval (examplesResult) and platform hint.
 * Throws on worker failure — the caller degrades to sharepic-only behavior.
 */
export async function generateSocialPostText(opts: {
  state: ChatGraphState;
  req?: Request;
}): Promise<SocialPostPayload> {
  const { state, req } = opts;
  const platform = state.platform ?? 'generic';
  const info = SOCIAL_PLATFORM_INFO[platform];

  const lastMsg = state.messages?.[state.messages.length - 1];
  const userText = lastMsg ? extractTextContent(lastMsg.content) : '';
  if (!userText.trim()) throw new Error('Empty user message for social post generation');

  // Reuse the examples-grounded prompt (rubric + up to 6 worked examples),
  // then pin the shared character budget so backend prompt and frontend
  // meter can't drift.
  const systemPrompt = `${buildSocialMediaSystemPrompt(state)}

## ZEICHENBUDGET
Ziel: ~${info.recommendedChars} Zeichen. Hartes Maximum: ${info.maxChars} Zeichen (inklusive Hashtags).`;

  const startTime = Date.now();
  const result = await state.aiWorkerPool.processRequest(
    {
      type: 'social_post_generation',
      systemPrompt,
      messages: [{ role: 'user', content: userText }],
      options: { temperature: 0.7, max_tokens: 1200 },
    },
    req as (Request & { user?: { id?: string }; sessionID?: string }) | null
  );

  if (!result.success || !result.content) {
    throw new Error(result.error || 'Social post generation returned no content');
  }

  const parsed = parseSocialPostText(result.content);
  log.info(
    `[SocialPost] Generated ${platform} post: ${parsed.charCount} chars, ` +
      `${parsed.hashtags.length} hashtags in ${Date.now() - startTime}ms`
  );

  return {
    postId: randomUUID(),
    platform,
    text: parsed.text,
    hashtags: parsed.hashtags,
    charCount: parsed.charCount,
    version: 1,
  };
}
