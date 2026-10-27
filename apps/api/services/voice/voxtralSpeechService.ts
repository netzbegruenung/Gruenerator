import { createLogger } from '../../utils/logger.js';
import mistralClient from '../ai/mistralClient.js';
import { recordOperation } from '../usage/UsageTrackingService.js';

const log = createLogger('voxtralSpeech');

const MODEL = 'voxtral-mini-tts-3';
/** "Heidi" — on 2026-10-21 the only German preset among Mistral's 66 voices. */
export const VOXTRAL_DEFAULT_VOICE_ID = 'voice_481';
/**
 * Measured 2026-10-21: the streamed `pcm` format is float32 LE mono at 24 kHz —
 * already what `/api/voice/tts/stream` hands its clients, so chunks pass through
 * unconverted. The WAV of a non-streamed request is PCM16; this is not.
 */
const SAMPLE_RATE = 24000;

interface VoxtralSpeechOptions {
  voiceId?: string | undefined;
  signal?: AbortSignal | undefined;
}

interface SpeechStreamCallbacks {
  onChunk: (chunk: { audio: string; index: number; sampleRate: number }) => void;
  onDone: (stats: { chunks: number; durationMs: number }) => void;
}

/**
 * Same callback shape as `ttsService.streamSpeech`, so the controller can pick
 * the provider without the client noticing. Throws instead of calling an error
 * callback — the controller already turns a throw into an `error` event.
 */
export async function streamVoxtralSpeech(
  text: string,
  options: VoxtralSpeechOptions,
  callbacks: SpeechStreamCallbacks
): Promise<void> {
  const startTime = Date.now();
  let chunkIndex = 0;
  let totalSamples = 0;

  try {
    const stream = await mistralClient.audio.speech.complete(
      {
        model: MODEL,
        input: text,
        voiceId: options.voiceId || VOXTRAL_DEFAULT_VOICE_ID,
        responseFormat: 'pcm',
        stream: true,
      },
      { fetchOptions: { signal: options.signal ?? null } }
    );

    for await (const event of stream) {
      if (event.data.type !== 'speech.audio.delta') continue;
      const audio = (event.data as { audioData: string }).audioData;
      totalSamples += Buffer.byteLength(audio, 'base64') / 4;
      callbacks.onChunk({ audio, index: chunkIndex++, sampleRate: SAMPLE_RATE });
    }

    callbacks.onDone({ chunks: chunkIndex, durationMs: Date.now() - startTime });
  } catch (error) {
    if (options.signal?.aborted) {
      log.debug('[VoxtralSpeech] Stream aborted by client', { chunks: chunkIndex });
      return;
    }
    throw error;
  } finally {
    const seconds = Math.round(totalSamples / SAMPLE_RATE);
    if (seconds > 0) {
      recordOperation({
        unit: 'speech_seconds',
        provider: 'mistral',
        model: MODEL,
        count: seconds,
      });
    }
  }
}
