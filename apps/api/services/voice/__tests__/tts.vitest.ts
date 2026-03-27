import { describe, it, expect } from 'vitest';
import mistralClient from '../../../workers/mistralClient.js';
import { CompleteAcceptEnum } from '@mistralai/mistralai/sdk/speech';

const HAS_MISTRAL_KEY = !!process.env.MISTRAL_API_KEY;

const MARIE_NEUTRAL_ID = '5a271406-039d-46fe-835b-fbbb00eaf08d';
const OLIVER_NEUTRAL_ID = 'e3596645-b1af-469e-b857-f18ddedc7652';

describe.skipIf(!HAS_MISTRAL_KEY)(
  'Voxtral TTS — integration tests (requires MISTRAL_API_KEY)',
  () => {
    it('non-streaming WAV with Marie Neutral speaking German', async () => {
      const response = await mistralClient.audio.speech.complete({
        model: 'voxtral-mini-tts-2603',
        input: 'Hallo, das ist ein Test der Sprachsynthese.',
        voiceId: MARIE_NEUTRAL_ID,
        responseFormat: 'wav',
      });

      const audioData = (response as { audioData: string }).audioData;
      expect(audioData).toBeTruthy();

      const buf = Buffer.from(audioData, 'base64');
      expect(buf.length).toBeGreaterThan(100);
      expect(buf.toString('ascii', 0, 4)).toBe('RIFF');
      console.log(`  Marie WAV: ${buf.length} bytes`);
    }, 30000);

    it('non-streaming WAV with Oliver Neutral speaking German', async () => {
      const response = await mistralClient.audio.speech.complete({
        model: 'voxtral-mini-tts-2603',
        input: 'Willkommen bei der grünen Partei.',
        voiceId: OLIVER_NEUTRAL_ID,
        responseFormat: 'wav',
      });

      const audioData = (response as { audioData: string }).audioData;
      expect(audioData).toBeTruthy();

      const buf = Buffer.from(audioData, 'base64');
      expect(buf.length).toBeGreaterThan(100);
      console.log(`  Oliver WAV: ${buf.length} bytes`);
    }, 30000);

    it('streaming PCM with voice_id', async () => {
      const stream = await mistralClient.audio.speech.complete(
        {
          model: 'voxtral-mini-tts-2603',
          input: 'Hallo Welt, dies ist ein Streaming Test.',
          voiceId: MARIE_NEUTRAL_ID,
          stream: true,
          responseFormat: 'pcm',
        },
        { acceptHeaderOverride: CompleteAcceptEnum.textEventStream }
      );

      let chunkCount = 0;
      let totalBytes = 0;
      let gotDone = false;

      for await (const event of stream as AsyncIterable<{
        event: string;
        data: { type: string; audioData?: string };
      }>) {
        if (event.data.type === 'speech.audio.delta' && event.data.audioData) {
          chunkCount++;
          const decoded = Buffer.from(event.data.audioData, 'base64');
          totalBytes += decoded.length;

          if (chunkCount === 1) {
            expect(decoded.length % 4).toBe(0);
            console.log(`  First chunk: ${decoded.length} bytes, float32 aligned`);
          }
        } else if (event.data.type === 'speech.audio.done') {
          gotDone = true;
        }
      }

      expect(chunkCount).toBeGreaterThan(0);
      expect(totalBytes).toBeGreaterThan(0);
      expect(gotDone).toBe(true);

      const durationSec = totalBytes / 4 / 24000;
      console.log(`  ${chunkCount} chunks, ${totalBytes} bytes, ~${durationSec.toFixed(2)}s audio`);
    }, 30000);

    it('voices list returns paginated response', async () => {
      const response = await mistralClient.audio.voices.list();
      const result = response as { items?: unknown[]; total: number };
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('items');
      console.log(`  ${result.total} voices`);
    }, 15000);

    it('rejects request without voice_id or ref_audio', async () => {
      await expect(
        mistralClient.audio.speech.complete({
          model: 'voxtral-mini-tts-2603',
          input: 'Test.',
          responseFormat: 'mp3',
        })
      ).rejects.toThrow();
    }, 15000);
  }
);
