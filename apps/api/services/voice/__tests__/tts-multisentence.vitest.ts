import { describe, it, expect } from 'vitest';
import ttsService from '../ttsService.js';

const HAS_MISTRAL_KEY = !!process.env.MISTRAL_API_KEY;

const SENTENCES = [
  'Die Grünen setzen sich für den Klimaschutz ein.',
  'Sie fordern eine schnelle Energiewende.',
  'Erneuerbare Energien sind die Zukunft.',
];

describe.skipIf(!HAS_MISTRAL_KEY)('TTS multi-sentence streaming (requires MISTRAL_API_KEY)', () => {
  it('streams multiple sentences sequentially without hanging', async () => {
    const results: Array<{
      sentence: string;
      chunks: number;
      bytes: number;
      doneReceived: boolean;
      durationMs: number;
    }> = [];

    for (const sentence of SENTENCES) {
      const start = Date.now();
      let chunkCount = 0;
      let totalBytes = 0;
      let doneReceived = false;

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Timeout: streamSpeech hung for sentence: "${sentence}"`));
        }, 30000);

        ttsService
          .streamSpeech(
            sentence,
            {},
            {
              onChunk: (chunk) => {
                chunkCount++;
                const decoded = Buffer.from(chunk.audio, 'base64');
                totalBytes += decoded.length;
              },
              onDone: (stats) => {
                doneReceived = true;
                clearTimeout(timeout);
                resolve();
              },
              onError: (error) => {
                clearTimeout(timeout);
                reject(error);
              },
            }
          )
          .then(() => {
            // If streamSpeech resolves but onDone was never called,
            // that's the bug — the response would hang in production.
            if (!doneReceived) {
              clearTimeout(timeout);
              console.warn(`  ⚠ streamSpeech resolved without onDone for: "${sentence}"`);
              resolve();
            }
          })
          .catch((err) => {
            clearTimeout(timeout);
            reject(err);
          });
      });

      results.push({
        sentence,
        chunks: chunkCount,
        bytes: totalBytes,
        doneReceived,
        durationMs: Date.now() - start,
      });
    }

    console.log('\n  Multi-sentence TTS results:');
    for (const r of results) {
      const audioSec = (r.bytes / 4 / 24000).toFixed(2);
      console.log(
        `  [${r.doneReceived ? '✓' : '✗'}] "${r.sentence.slice(0, 40)}..." → ${r.chunks} chunks, ~${audioSec}s audio, ${r.durationMs}ms`
      );
    }

    for (const r of results) {
      expect(r.chunks).toBeGreaterThan(0);
      expect(r.bytes).toBeGreaterThan(0);
      expect(r.doneReceived).toBe(true);
    }
  }, 90000);

  it('concatenated multi-sentence audio produces valid PCM', async () => {
    const allPcm: Buffer[] = [];

    for (const sentence of SENTENCES) {
      await new Promise<void>((resolve, reject) => {
        ttsService
          .streamSpeech(
            sentence,
            {},
            {
              onChunk: (chunk) => {
                allPcm.push(Buffer.from(chunk.audio, 'base64'));
              },
              onDone: () => resolve(),
              onError: (err) => reject(err),
            }
          )
          .then(() => resolve())
          .catch(reject);
      });
    }

    const combined = Buffer.concat(allPcm);
    const totalSamples = combined.length / 4; // float32
    const durationSec = totalSamples / 24000;

    console.log(
      `\n  Combined: ${combined.length} bytes, ${totalSamples} samples, ~${durationSec.toFixed(2)}s`
    );

    expect(combined.length).toBeGreaterThan(0);
    expect(combined.length % 4).toBe(0);
    expect(durationSec).toBeGreaterThan(1);
  }, 90000);
});
