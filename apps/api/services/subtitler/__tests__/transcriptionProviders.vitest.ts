/**
 * Round-trip transcription test: generate speech with Voxtral TTS, then transcribe it back.
 * Tests both Voxtral and Regolo (faster-whisper) transcription providers.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import mistralClient from '../../../workers/mistralClient.js';

const HAS_MISTRAL_KEY = !!process.env.MISTRAL_API_KEY;
const HAS_REGOLO_KEY = !!process.env.REGOLO_API_KEY;

const MARIE_NEUTRAL_ID = '5a271406-039d-46fe-835b-fbbb00eaf08d';
const INPUT_TEXT =
  'Hallo, willkommen beim Grünerator. Heute sprechen wir über Klimaschutz und Nachhaltigkeit.';

let speechWavPath: string;

describe.skipIf(!HAS_MISTRAL_KEY)('Round-trip TTS → transcription', () => {
  beforeAll(async () => {
    const response = await mistralClient.audio.speech.complete({
      model: 'voxtral-mini-tts-2603',
      input: INPUT_TEXT,
      voiceId: MARIE_NEUTRAL_ID,
      responseFormat: 'wav',
    });

    const audioData = (response as { audioData: string }).audioData;
    const wavBuffer = Buffer.from(audioData, 'base64');
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
      responseFormat: 'verbose_json',
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

  it.skipIf(!HAS_REGOLO_KEY)(
    'Regolo faster-whisper transcription with word timestamps',
    async () => {
      const fileBuffer = fs.readFileSync(speechWavPath);
      const blob = new Blob([fileBuffer], { type: 'audio/wav' });

      const form = new FormData();
      form.append('file', blob, 'speech.wav');
      form.append('model', 'faster-whisper-large-v3');
      form.append('language', 'de');
      form.append('response_format', 'verbose_json');
      form.append('timestamp_granularities[]', 'word');

      const response = await fetch('https://api.regolo.ai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.REGOLO_API_KEY}` },
        body: form,
      });

      expect(response.ok).toBe(true);
      const data = (await response.json()) as {
        text: string;
        segments?: Array<{
          text: string;
          words?: Array<{ word: string; start: number; end: number }>;
        }>;
      };

      expect(data.text).toBeTruthy();
      // faster-whisper produces variable spellings of the made-up word "Grünerator":
      // "grünerator", "grüne rator", "gründerator", "gronerator", etc.
      expect(data.text.toLowerCase()).toMatch(/gr[üöo]n+[de]?\s?e?rator/);

      const words: Array<{ word: string; start: number; end: number }> = [];
      if (data.segments) {
        for (const seg of data.segments) {
          if (seg.words) {
            for (const w of seg.words) {
              words.push({ word: w.word.trim(), start: w.start, end: w.end });
            }
          }
        }
      }

      expect(words.length).toBeGreaterThan(5);
      expect(words[0]!.start).toBeGreaterThanOrEqual(0);
      expect(words[0]!.end).toBeGreaterThan(words[0]!.start);

      console.log(`  Text: "${data.text}"`);
      console.log(`  Words: ${words.length}`);
      console.log(
        `  First 3: ${words
          .slice(0, 3)
          .map((w) => `"${w.word}" [${w.start}-${w.end}]`)
          .join(', ')}`
      );
    },
    30000
  );
});
