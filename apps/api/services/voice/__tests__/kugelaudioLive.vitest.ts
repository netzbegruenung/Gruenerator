/**
 * Live smoke test against KugelAudio.
 *
 * Behind the RUN_LIVE_PROVIDER_TESTS opt-in, like the subtitler round-trip: it
 * costs money and needs the network, so a plain `pnpm test` on a machine with a
 * populated .env must not trigger it. The two Mistral TTS tests this replaces
 * were gated on the API key alone and so billed on every run.
 *
 * What it pins is the wire contract we cannot check offline: that the provider
 * really answers with PCM16 at the rate we asked for, and that what we put on
 * our own SSE stream stays 4-byte aligned float32.
 */

import { describe, expect, it } from 'vitest';

import ttsService from '../ttsService.js';

const RUN_LIVE = !!process.env.RUN_LIVE_PROVIDER_TESTS;
const HAS_KEY = RUN_LIVE && !!process.env.KUGELAUDIO_API_KEY;

const TEXT = 'Hallo, willkommen beim Grünerator. Heute geht es um Klimaschutz.';

describe.skipIf(!HAS_KEY)('KugelAudio TTS (live)', () => {
  it('returns a playable WAV from generateSpeech', async () => {
    const wav = await ttsService.generateSpeech(TEXT, { language: 'de' });

    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wav.readUInt16LE(34)).toBe(16);
    // 44-byte header plus a quarter second of audio at the very least.
    expect(wav.length).toBeGreaterThan(44 + 24000);
  }, 30_000);

  it('streams float32 chunks and finishes exactly once', async () => {
    const chunks: { audio: string; index: number; sampleRate: number }[] = [];
    let done = 0;
    let failure: Error | null = null;

    await ttsService.streamSpeech(
      TEXT,
      { language: 'de' },
      {
        onChunk: (chunk) => chunks.push(chunk),
        onDone: () => void done++,
        onError: (error) => void (failure = error),
      }
    );

    expect(failure).toBeNull();
    expect(done).toBe(1);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i));

    let samples = 0;
    for (const chunk of chunks) {
      const bytes = Buffer.from(chunk.audio, 'base64');
      // The clients read this as a Float32Array; an unaligned length would mean
      // the carry logic let a half sample through.
      expect(bytes.length % 4).toBe(0);
      samples += bytes.length / 4;
    }

    const seconds = samples / (chunks[0]?.sampleRate ?? 24000);
    expect(seconds).toBeGreaterThan(0.5);
  }, 30_000);

  it('lists German voices with numeric ids', async () => {
    const voices = await ttsService.listVoices('de');

    expect(voices.length).toBeGreaterThan(0);
    expect(Number.isInteger(Number(voices[0]!.id))).toBe(true);
  }, 30_000);
});
