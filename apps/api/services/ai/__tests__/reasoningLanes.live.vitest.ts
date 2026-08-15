/**
 * Live reasoning check — one case per lane the auto policy can select.
 *
 * These hit the REAL upstreams and are skipped without the matching API key,
 * following the convention in services/ai/execution/__tests__/regolo.vitest.ts and
 * services/vision/__tests__/vision.vitest.ts.
 *
 *   REGOLO_API_KEY=…  LITELLM_BASE_URL=… LITELLM_API_KEY=…  MISTRAL_API_KEY=… \
 *     pnpm --filter @gruenerator/api test reasoningLanes
 *
 * What it verifies, per lane:
 *   1. reasoning ON  → the lane actually emits reasoning deltas, and text too.
 *   2. reasoning OFF → NO reasoning is emitted (this is the whole point of the
 *      `direct` speed path: verdigado-pro and the Regolo family think by
 *      DEFAULT, so "off" is a real behavioural switch, not a no-op).
 *
 * Point 2 is the regression that matters most: it is the difference between a
 * fast greeting and one that stalls behind a thinking block.
 */

import { generateText } from 'ai';
import { describe, it, expect } from 'vitest';

import { getModel } from '../../../routes/chat/agents/providers.js';
import { isReasoningStreamModel, streamWithReasoning } from '../regoloReasoningStream.js';

import type { ModelMessage } from 'ai';

const HAS_REGOLO = !!process.env.REGOLO_API_KEY;
const HAS_LITELLM = !!process.env.LITELLM_BASE_URL && !!process.env.LITELLM_API_KEY;
const HAS_MISTRAL = !!process.env.MISTRAL_API_KEY;

const TIMEOUT_MS = 90_000;

/**
 * Generous on purpose. Measured live: at 400 tokens the reasoning consumed the
 * ENTIRE allowance on both Small 4 and Mistral and the answer came back empty.
 * A reasoning lane needs room for the thinking phase AND the answer.
 */
const MAX_TOKENS = 3000;

/** Short enough to stay cheap, open enough that a thinking model will think. */
const PROMPT: ModelMessage[] = [
  {
    role: 'user',
    content: 'Wenn ein Zug um 9:40 losfährt und 95 Minuten braucht — wann kommt er an?',
  },
];

interface LaneRun {
  text: string;
  reasoning: string;
  chunks: number;
}

async function runReasoningLane(
  provider: string,
  model: string,
  effort?: 'low' | 'medium' | 'high'
): Promise<LaneRun> {
  const out: LaneRun = { text: '', reasoning: '', chunks: 0 };
  const params: Parameters<typeof streamWithReasoning>[0] = {
    provider,
    model,
    messages: PROMPT,
    maxTokens: MAX_TOKENS,
    temperature: 0.2,
    ...(effort && { effort }),
  };
  for await (const chunk of streamWithReasoning(params)) {
    out.chunks++;
    if (chunk.type === 'reasoning') out.reasoning += chunk.delta;
    else out.text += chunk.delta;
  }
  return out;
}

/** The `off` path: the SDK route, which is what streamForResolution uses when
 *  reasoningEffort === 'off'. Thinking must not leak into the answer. */
async function runSdkLane(provider: string, model: string): Promise<string> {
  const result = await generateText({
    model: getModel(provider, model),
    messages: PROMPT,
    maxOutputTokens: MAX_TOKENS,
    temperature: 0.2,
  });
  return result.text;
}

/** Raw <think> blocks or an empty answer mean thinking leaked into content
 *  instead of being suppressed. */
function looksLikeLeakedThinking(text: string): boolean {
  return /<think>|<\|channel\|>|^\s*analysis/i.test(text);
}

// ─── Regolo lanes ───────────────────────────────────────────────────────────

describe.skipIf(!HAS_REGOLO)('reasoning lanes — Regolo', () => {
  it(
    'mistral-small-4-119b CAN think — so grading it up would not be a no-op',
    async () => {
      // The capability is real, which is why it is registered. The policy still
      // keeps this lane at `off`: measured cost was ~1.6-2k chars of reasoning
      // for a trivial question, on the lane we picked for speed.
      expect(isReasoningStreamModel('regolo', 'mistral-small-4-119b')).toBe(true);
      const run = await runReasoningLane('regolo', 'mistral-small-4-119b', 'low');
      expect(run.text.length, 'no answer text').toBeGreaterThan(0);
      expect(run.reasoning.length, 'no reasoning deltas').toBeGreaterThan(0);
    },
    TIMEOUT_MS
  );

  it(
    'mistral-small-4-119b stays silent about thinking on the SDK path (off)',
    async () => {
      const text = await runSdkLane('regolo', 'mistral-small-4-119b');
      expect(text.length).toBeGreaterThan(0);
      expect(looksLikeLeakedThinking(text), `leaked: ${text.slice(0, 200)}`).toBe(false);
    },
    TIMEOUT_MS
  );

  it(
    'gemma4-31b emits reasoning',
    async () => {
      const run = await runReasoningLane('regolo', 'gemma4-31b');
      expect(run.text.length).toBeGreaterThan(0);
      expect(run.reasoning.length).toBeGreaterThan(0);
    },
    TIMEOUT_MS
  );

  it(
    'gpt-oss-120b honours the native reasoning_effort dial',
    async () => {
      const run = await runReasoningLane('regolo', 'gpt-oss-120b', 'low');
      expect(run.text.length).toBeGreaterThan(0);
      expect(run.reasoning.length).toBeGreaterThan(0);
    },
    TIMEOUT_MS
  );
});

// ─── LiteLLM / Verdigado lanes ──────────────────────────────────────────────

describe.skipIf(!HAS_LITELLM)('reasoning lanes — Verdigado (LiteLLM)', () => {
  it(
    'verdigado-think emits reasoning',
    async () => {
      const run = await runReasoningLane('litellm', 'verdigado-think');
      expect(run.text.length).toBeGreaterThan(0);
      expect(run.reasoning.length).toBeGreaterThan(0);
    },
    TIMEOUT_MS
  );

  it(
    'verdigado-pro emits reasoning with an explicit effort',
    async () => {
      const run = await runReasoningLane('litellm', 'verdigado-pro', 'low');
      expect(run.text.length).toBeGreaterThan(0);
      expect(run.reasoning.length).toBeGreaterThan(0);
    },
    TIMEOUT_MS
  );

  it(
    'verdigado-pro on the SDK path does NOT think — this is the `direct` speed path',
    async () => {
      // The most important assertion in this file: `direct` routes GPT-OSS
      // around the reasoning streamer so a greeting never waits on a thinking
      // block. litellmFetchWithThinkingDisabled sets think:false here.
      const text = await runSdkLane('litellm', 'verdigado-pro');
      expect(text.length).toBeGreaterThan(0);
      expect(looksLikeLeakedThinking(text), `leaked: ${text.slice(0, 200)}`).toBe(false);
    },
    TIMEOUT_MS
  );
});

// ─── Mistral lane ───────────────────────────────────────────────────────────

/**
 * `{ needsReasoning: true }` is REQUIRED on every model in this block.
 *
 * Mistral Medium 3.5 is served by Scaleway by default, and that lane is reached
 * through @ai-sdk/openai — which never receives a `providerOptions.mistral`
 * block. Without the flag these cases would exercise a model that cannot see
 * the option at all, and the suite would stay green while the product had
 * quietly stopped thinking. The flag pins the request to @ai-sdk/mistral, where
 * reasoning works and is surfaced. See routeMistralModel.
 */
const REASONING_ROUTE = { needsReasoning: true } as const;

describe.skipIf(!HAS_MISTRAL)('reasoning lanes — Mistral', () => {
  it(
    'mistral-medium-2604 thinks only when reasoningEffort is set',
    async () => {
      const withEffort = await generateText({
        model: getModel('mistral', 'mistral-medium-2604', REASONING_ROUTE),
        messages: PROMPT,
        maxOutputTokens: MAX_TOKENS,
        temperature: 0.2,
        providerOptions: { mistral: { reasoningEffort: 'high' } },
      });
      expect(withEffort.text.length).toBeGreaterThan(0);
      expect(withEffort.reasoningText?.length ?? 0, 'expected reasoning at high').toBeGreaterThan(
        0
      );
    },
    TIMEOUT_MS
  );

  it(
    'rejects the intermediate steps of our scale — the dial is binary',
    async () => {
      // This is why mistralReasoningOption exists. Passing the policy's raw
      // 'medium' straight through would throw here, in production.
      await expect(
        generateText({
          model: getModel('mistral', 'mistral-medium-2604', REASONING_ROUTE),
          messages: PROMPT,
          maxOutputTokens: 64,
          providerOptions: { mistral: { reasoningEffort: 'medium' } },
        })
      ).rejects.toThrow(/invalid mistral provider options/i);
    },
    TIMEOUT_MS
  );

  it(
    'mistral-medium-2604 does not think without it (the `off` path)',
    async () => {
      const plain = await generateText({
        model: getModel('mistral', 'mistral-medium-2604', REASONING_ROUTE),
        messages: PROMPT,
        maxOutputTokens: MAX_TOKENS,
        temperature: 0.2,
      });
      expect(plain.text.length).toBeGreaterThan(0);
      expect(plain.reasoningText?.length ?? 0, 'unexpected reasoning without effort').toBe(0);
    },
    TIMEOUT_MS
  );

  /**
   * The trap itself, asserted rather than merely described.
   *
   * Without `needsReasoning` the same call resolves to Scaleway, where the
   * mistral option is dropped in silence — no error, no reasoning, text that
   * looks perfectly fine. If this case ever starts producing reasoning, the
   * routing changed and the carve-out above stopped being load-bearing: remove
   * it deliberately rather than letting it rot.
   */
  it.skipIf(!process.env.SCALEWAY_API_KEY)(
    'drops the mistral reasoning option on the Scaleway upstream',
    async () => {
      const onScaleway = await generateText({
        model: getModel('mistral', 'mistral-medium-2604'),
        messages: PROMPT,
        maxOutputTokens: MAX_TOKENS,
        temperature: 0.2,
        providerOptions: { mistral: { reasoningEffort: 'high' } },
      });
      expect(onScaleway.text.length, 'Scaleway must still answer').toBeGreaterThan(0);
      expect(onScaleway.reasoningText?.length ?? 0).toBe(0);
    },
    TIMEOUT_MS
  );
});
