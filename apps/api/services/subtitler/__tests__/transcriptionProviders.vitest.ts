/**
 * Round-trip transcription test: synthesise speech, then transcribe it back.
 * Tests the Voxtral transcription provider.
 *
 * The speech side goes through our own ttsService rather than a provider SDK,
 * so this stays a transcription test and does not pin a TTS vendor.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import mistralClient from '../../ai/mistralClient.js';
import ttsService from '../../voice/ttsService.js';

// Live round-trip (real TTS → real transcription) — billable and network-flaky,
// so it only runs under the explicit opt-in, not on every `pnpm test` that
// happens to have keys in .env.
const RUN_LIVE = !!process.env.RUN_LIVE_PROVIDER_TESTS;
const HAS_MISTRAL_KEY = RUN_LIVE && !!process.env.MISTRAL_API_KEY;
// The fixture audio now comes from KugelAudio, so its key gates the whole file.
const CAN_SYNTHESISE = HAS_MISTRAL_KEY && !!process.env.KUGELAUDIO_API_KEY;

const INPUT_TEXT =
  'Hallo, willkommen beim Grünerator. Heute sprechen wir über Klimaschutz und Nachhaltigkeit.';

let speechWavPath: string;

describe.skipIf(!CAN_SYNTHESISE)('Round-trip TTS → transcription', () => {
  beforeAll(async () => {
    const wavBuffer = await ttsService.generateSpeech(INPUT_TEXT, { language: 'de' });
    speechWavPath = `/tmp/roundtrip_tts_${Date.now()}.wav`;
    fs.writeFileSync(speechWavPath, wavBuffer);
    console.log(`  TTS generated: ${wavBuffer.length} bytes → ${speechWavPath}`);
  }, 30000);

  it('Voxtral transcription with word timestamps', async () => {
    const audioBuffer = fs.readFileSync(speechWavPath);

    const result = await mistralClient.audio.transcriptions.complete({
      model: 'voxtral-mini-latest',
      file: { fileName: 'speech.wav', content: audioBuffer },
      language: 'de',
      timestampGranularities: ['word'],
    });

    const resp = result as {
      text: string;
      segments?: Array<{ text: string; start: number; end: number }>;
    };

    expect(resp.text).toBeTruthy();
    expect(resp.text.toLowerCase()).toMatch(/gr[üö]n+erator/);
    expect(resp.segments).toBeDefined();
    expect(resp.segments!.length).toBeGreaterThan(5);

    const words = resp.segments!.map((s) => ({
      word: s.text.trim(),
      start: s.start,
      end: s.end,
    }));

    expect(words[0]!.start).toBeGreaterThanOrEqual(0);
    expect(words[0]!.end).toBeGreaterThan(words[0]!.start);

    console.log(`  Text: "${resp.text}"`);
    console.log(`  Words: ${words.length}`);
    console.log(
      `  First 3: ${words
        .slice(0, 3)
        .map((w) => `"${w.word}" [${w.start}-${w.end}]`)
        .join(', ')}`
    );
  }, 30000);
});
