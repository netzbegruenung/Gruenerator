/**
 * Voxtral's two request-shape rules, pinned at the boundary that sends them.
 *
 * Found 2026-07-31 by running a 45-minute recording through the protokoll path:
 * the request came back HTTP 422, the chain then handed the file to Regolo,
 * Regolo gave up after five minutes, and `identifySpeakers` got no
 * `[speaker_N]` marker at all. Speaker identification was simply dead.
 *
 * The service is a default-exported singleton whose methods call the network,
 * so the rules are exercised through a stubbed Mistral client: what matters is
 * the payload that leaves the process.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const complete = vi.fn().mockResolvedValue({ text: 'ok', segments: [] });

vi.mock('../../../workers/mistralClient.js', () => ({
  default: { audio: { transcriptions: { complete } } },
}));

const { default: mistralVoiceService } = await import('../mistralVoiceService.js');

/** The payload handed to the Mistral SDK on the last call. */
function lastPayload(): Record<string, unknown> {
  return complete.mock.calls.at(-1)?.[0] as Record<string, unknown>;
}

beforeEach(() => {
  complete.mockClear();
});

describe('diarization implies segment timestamps', () => {
  it('sets the granularity even when the caller asked for no timestamps', async () => {
    // The exact combination that produced the 422: the routers treat `diarize`
    // and `timestamps` as independent flags.
    await mistralVoiceService.transcribeFromBuffer(Buffer.from('x'), 'a.mp3', {
      language: 'de',
      diarize: true,
    });

    expect(lastPayload().timestampGranularities).toEqual(['segment']);
    expect(lastPayload().diarize).toBe(true);
  });

  it('never sends diarize with an empty granularity list', async () => {
    await mistralVoiceService.transcribeFromBuffer(Buffer.from('x'), 'a.mp3', {
      diarize: true,
      timestamp_granularities: [],
    });

    // `got []` is literally what the API complained about.
    expect(lastPayload().timestampGranularities).toEqual(['segment']);
  });

  it('leaves granularity alone when diarization is off', async () => {
    await mistralVoiceService.transcribeFromBuffer(Buffer.from('x'), 'a.mp3', { language: 'de' });

    expect(lastPayload().timestampGranularities).toBeUndefined();
    expect(lastPayload().diarize).toBeUndefined();
  });

  it('applies to the URL entry point too', async () => {
    // Two entry points, one rule — the duplication is how the first bug got in.
    await mistralVoiceService.transcribeFromUrl('https://example.org/a.mp3', { diarize: true });

    expect(lastPayload().timestampGranularities).toEqual(['segment']);
  });
});

describe('caller-supplied context bias is normalized', () => {
  it('splits a phrase the caller passed in', async () => {
    // Normalizing only inside buildContextBias would leave this path able to
    // trigger the HTTP 400 on its own.
    await mistralVoiceService.transcribeFromBuffer(Buffer.from('x'), 'a.mp3', {
      contextBias: ['Die Linke', 'Leonore Gewessler'],
    });

    expect(lastPayload().contextBias).toEqual(['Die', 'Linke', 'Leonore', 'Gewessler']);
  });

  it('omits the field entirely when nothing survives normalization', async () => {
    await mistralVoiceService.transcribeFromBuffer(Buffer.from('x'), 'a.mp3', {
      contextBias: ['   ', ','],
    });

    // An empty array is not the same as "no bias" to a strict validator.
    expect(lastPayload().contextBias).toBeUndefined();
  });
});
