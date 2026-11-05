/**
 * Subtitles go to GreenPT first (Voxtral 3 has no word timestamps). GreenPT can
 * answer with text but no words — that must fall through to Voxtral instead of
 * reaching the subtitle generator, which cannot cut cues without word timings.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const transcribeWithGreenPT = vi.fn();
const transcribeWithVoxtral = vi.fn();

vi.mock('../../../config/env.js', () => ({
  env: { MISTRAL_API_KEY: 'm', GREENPT_API_KEY: 'g', TRANSCRIPTION_PROVIDER: 'auto' },
}));
vi.mock('../greenptTranscriptionService.js', () => ({ transcribeWithGreenPT }));
vi.mock('../voxtralTranscriptionService.js', () => ({ transcribeWithVoxtral }));
vi.mock('../../usage/UsageTrackingService.js', () => ({ recordOperation: vi.fn() }));
vi.mock('../backgroundCompressionService.js', () => ({ startBackgroundCompression: vi.fn() }));
vi.mock('../videoUploadService.js', () => ({ extractAudio: vi.fn() }));

const { transcribeWithProvider } = await import('../transcriptionService.js');

const WORDS = [{ word: 'Hallo', start: 0, end: 0.4 }];

beforeEach(() => {
  transcribeWithGreenPT.mockReset();
  transcribeWithVoxtral.mockReset();
});

describe('transcribeWithProvider with word timestamps', () => {
  it('falls back to Voxtral when GreenPT returns text without words', async () => {
    transcribeWithGreenPT.mockResolvedValue({ text: 'Hallo' });
    transcribeWithVoxtral.mockResolvedValue({ text: 'Hallo', words: WORDS });

    await expect(transcribeWithProvider('/tmp/a.mp3', true)).resolves.toEqual({
      text: 'Hallo',
      words: WORDS,
    });
    expect(transcribeWithGreenPT).toHaveBeenCalledOnce();
  });

  it('returns the wordless result when no provider has words (silent audio)', async () => {
    transcribeWithGreenPT.mockResolvedValue({ text: '' });
    transcribeWithVoxtral.mockResolvedValue({ text: '' });

    await expect(transcribeWithProvider('/tmp/a.mp3', true)).resolves.toEqual({ text: '' });
  });

  it('accepts a wordless result when no word timestamps were requested', async () => {
    transcribeWithVoxtral.mockResolvedValue({ text: 'Hallo' });

    await expect(transcribeWithProvider('/tmp/a.mp3', false)).resolves.toEqual({ text: 'Hallo' });
    expect(transcribeWithGreenPT).not.toHaveBeenCalled();
  });
});
