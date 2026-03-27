import { CompleteAcceptEnum } from '@mistralai/mistralai/sdk/speech';

import { createLogger } from '../../utils/logger.js';
import mistralClient from '../../workers/mistralClient.js';

const log = createLogger('tts');

const DEFAULT_MODEL = 'voxtral-mini-tts-2603';
const DEFAULT_VOICE_ID =
  process.env.VOXTRAL_DEFAULT_VOICE_ID || 'c69964a6-ab8b-4f8a-9465-ec0925096ec8'; // Paul - Neutral
const VOXTRAL_SAMPLE_RATE = 24000;

interface TTSOptions {
  modelId?: string;
  voiceId?: string;
  refAudio?: string;
  language?: string;
}

interface TTSStreamCallbacks {
  onChunk?: (chunk: { audio: string; index: number; sampleRate: number }) => void;
  onDone?: (stats: { chunks: number; durationMs: number }) => void;
  onError?: (error: Error) => void;
}

interface Voice {
  id: string;
  name: string;
  languages?: string[];
  gender?: string;
}

interface Model {
  id: string;
  name: string;
}

class TTSService {
  async generateSpeech(text: string, options: TTSOptions = {}): Promise<Buffer> {
    const { modelId = DEFAULT_MODEL, voiceId, refAudio } = options;
    const effectiveVoiceId = voiceId || (!refAudio ? DEFAULT_VOICE_ID : undefined);

    log.debug('[TTS] Generating speech', {
      textLength: text.length,
      modelId,
      voiceId: effectiveVoiceId,
    });

    const response = await mistralClient.audio.speech.complete({
      model: modelId,
      input: text,
      ...(effectiveVoiceId ? { voiceId: effectiveVoiceId } : {}),
      ...(refAudio ? { refAudio } : {}),
      responseFormat: 'wav',
    });

    const audioData = (response as { audioData: string }).audioData;
    const wavBuffer = Buffer.from(audioData, 'base64');

    log.debug('[TTS] Speech generated', { wavSize: wavBuffer.length });

    return wavBuffer;
  }

  async streamSpeech(
    text: string,
    options: TTSOptions = {},
    callbacks: TTSStreamCallbacks = {}
  ): Promise<void> {
    const { modelId = DEFAULT_MODEL, voiceId, refAudio } = options;
    const effectiveVoiceId = voiceId || (!refAudio ? DEFAULT_VOICE_ID : undefined);

    log.debug('[TTS] Starting speech stream', {
      textLength: text.length,
      modelId,
      voiceId: effectiveVoiceId,
    });

    const startTime = Date.now();
    let chunkIndex = 0;

    try {
      const stream = await mistralClient.audio.speech.complete(
        {
          model: modelId,
          input: text,
          ...(effectiveVoiceId ? { voiceId: effectiveVoiceId } : {}),
          ...(refAudio ? { refAudio } : {}),
          stream: true,
          responseFormat: 'pcm',
        },
        { acceptHeaderOverride: CompleteAcceptEnum.textEventStream }
      );

      for await (const event of stream as AsyncIterable<{
        event: string;
        data: { type: string; audioData?: string };
      }>) {
        if (event.data.type === 'speech.audio.delta' && event.data.audioData) {
          callbacks.onChunk?.({
            audio: event.data.audioData,
            index: chunkIndex++,
            sampleRate: VOXTRAL_SAMPLE_RATE,
          });
        } else if (event.data.type === 'speech.audio.done') {
          const durationMs = Date.now() - startTime;
          log.debug('[TTS] Stream completed', { chunks: chunkIndex, durationMs });
          callbacks.onDone?.({ chunks: chunkIndex, durationMs });
        }
      }
    } catch (error) {
      log.error('[TTS] Stream error:', error);
      callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async listVoices(_language?: string): Promise<Voice[]> {
    log.debug('[TTS] Listing voices');
    const response = await mistralClient.audio.voices.list();
    const voices =
      (
        response as {
          items?: Array<{ id: string; name: string; languages?: string[]; gender?: string }>;
        }
      ).items ?? [];
    return voices.map((v) => ({
      id: v.id,
      name: v.name,
      languages: v.languages,
      gender: v.gender,
    }));
  }

  async listModels(): Promise<Model[]> {
    return [{ id: DEFAULT_MODEL, name: 'Voxtral Mini TTS' }];
  }
}

const instance = new TTSService();
export default instance;
export { TTSService };
export type { TTSOptions, TTSStreamCallbacks, Voice, Model };
