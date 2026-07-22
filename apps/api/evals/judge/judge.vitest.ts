/**
 * Judge tier tests. The prompt-shape tests always run; the live calibration
 * tests (fixtures replaying the historical class-6 "keine Treffer auf echten
 * Daten" and class-11 "Edit angewendet, Text leugnet ihn" bugs MUST fail the
 * judge) run only when LITELLM_BASE_URL/_API_KEY are set.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import { buildRubricPrompt } from './rubrics.js';

import type { CaseResult, TurnResult } from '../types.js';

const HERE = dirname(fileURLToPath(import.meta.url));

function loadFixtureTurn(file: string): { turn: TurnResult; caseResult: CaseResult } {
  const cases = JSON.parse(readFileSync(join(HERE, 'fixtures', file), 'utf8')) as CaseResult[];
  return { turn: cases[0].turns[0], caseResult: cases[0] };
}

describe('buildRubricPrompt', () => {
  it('groundedness embeds answer and numbered sources', () => {
    const { turn } = loadFixtureTurn('class6-ungrounded-keine-treffer.json');
    const prompt = buildRubricPrompt('groundedness', turn, {});
    expect(prompt).not.toBeNull();
    expect(prompt!.user).toContain('keine Treffer');
    expect(prompt!.user).toContain('[1] Wahlprogramm 2025');
    expect(prompt!.system).toContain('"pass"');
  });

  it('groundedness returns null without citations', () => {
    const { turn } = loadFixtureTurn('class11-edit-denied.json');
    expect(buildRubricPrompt('groundedness', turn, {})).toBeNull();
  });

  it('narration_consistency embeds actions and answer text', () => {
    const { turn } = loadFixtureTurn('class11-edit-denied.json');
    const prompt = buildRubricPrompt('narration_consistency', turn, {});
    expect(prompt!.user).toContain('edit_document → ok');
    expect(prompt!.user).toContain('Editor-Operationen wurden angewendet');
    expect(prompt!.user).toContain('leider nicht ändern');
  });

  it('known_answer requires facts, parity requires a comparison turn', () => {
    const { turn } = loadFixtureTurn('class6-ungrounded-keine-treffer.json');
    expect(buildRubricPrompt('known_answer', turn, {})).toBeNull();
    expect(buildRubricPrompt('parity', turn, {})).toBeNull();
    expect(buildRubricPrompt('known_answer', turn, { facts: ['x'] })).not.toBeNull();
  });
});

// Live calibration hits the real verdigado LiteLLM proxy — a billable network
// call that must not run (nor leave a dangling rejection) in the default
// `pnpm test` just because keys sit in the local .env. Opt in with
// RUN_LIVE_PROVIDER_TESTS=1, consistent with the live provider-integration tests.
describe.skipIf(
  !process.env.LITELLM_API_KEY ||
    !process.env.LITELLM_BASE_URL ||
    !process.env.RUN_LIVE_PROVIDER_TESTS
)('judge calibration (live)', () => {
  async function judge(system: string, user: string): Promise<boolean | null> {
    const base = (process.env.LITELLM_BASE_URL ?? '').replace(/\/$/, '');
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.LITELLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.EVAL_JUDGE_MODEL ?? 'verdigado-pro',
        temperature: 0,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const { parseVerdict } = await import('./runJudge.js');
    return parseVerdict(json.choices?.[0]?.message?.content ?? '')?.pass ?? null;
  }

  it('fails the historical class-6 bug (real sources, "keine Treffer" answer)', async () => {
    const { turn } = loadFixtureTurn('class6-ungrounded-keine-treffer.json');
    const prompt = buildRubricPrompt('groundedness', turn, {})!;
    expect(await judge(prompt.system, prompt.user)).toBe(false);
  }, 60000);

  it('fails the historical class-11 bug (edit applied, text denies it)', async () => {
    const { turn } = loadFixtureTurn('class11-edit-denied.json');
    const prompt = buildRubricPrompt('narration_consistency', turn, {})!;
    expect(await judge(prompt.system, prompt.user)).toBe(false);
  }, 60000);
});
