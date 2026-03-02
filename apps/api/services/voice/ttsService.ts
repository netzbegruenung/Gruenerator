import {
  KugelAudio,
  createWavFile,
  type Voice as SDKVoice,
  type Model as SDKModel,
} from 'kugelaudio';

import { createLogger } from '../../utils/logger.js';

const log = createLogger('tts');

interface TTSOptions {
  modelId?: string;
  voiceId?: number;
  cfgScale?: number;
  language?: string;
}

interface TTSStreamCallbacks {
  onChunk?: (chunk: { audio: string; index: number; sampleRate: number }) => void;
  onDone?: (stats: { chunks: number; durationMs: number; generationMs: number }) => void;
  onError?: (error: Error) => void;
}

type Voice = SDKVoice;
type Model = SDKModel;

const DEFAULT_MODEL = 'kugel-1-turbo';
const DEFAULT_LANGUAGE = 'de';
const DEFAULT_CFG_SCALE = 2.0;

class TTSService {
  private client: KugelAudio | null = null;

  private getClient(): KugelAudio {
    if (!this.client) {
      const apiKey = process.env.KUGELAUDIO_API_KEY;
      if (!apiKey) {
        throw new Error('KUGELAUDIO_API_KEY is not configured');
      }
      this.client = new KugelAudio({ apiKey });
      log.info('[TTS] KugelAudio client initialized');
    }
    return this.client;
  }

  async generateSpeech(text: string, options: TTSOptions = {}): Promise<Buffer> {
    const client = this.getClient();
    const {
      modelId = DEFAULT_MODEL,
      voiceId,
      cfgScale = DEFAULT_CFG_SCALE,
      language = DEFAULT_LANGUAGE,
    } = options;

    log.debug('[TTS] Generating speech', {
      textLength: text.length,
      modelId,
      voiceId,
      language,
    });

    const audio = await client.tts.generate({
      text,
      modelId,
      voiceId,
      cfgScale,
      language,
    });

    const wavBytes = createWavFile(audio.audio, audio.sampleRate);

    log.debug('[TTS] Speech generated', {
      durationMs: audio.durationMs,
      generationMs: audio.generationMs,
      sampleRate: audio.sampleRate,
    });

    return Buffer.from(wavBytes);
  }

  async streamSpeech(
    text: string,
    options: TTSOptions = {},
    callbacks: TTSStreamCallbacks = {}
  ): Promise<void> {
    const client = this.getClient();
    const {
      modelId = DEFAULT_MODEL,
      voiceId,
      cfgScale = DEFAULT_CFG_SCALE,
      language = DEFAULT_LANGUAGE,
    } = options;

    if (!client.tts.isConnected()) {
      await client.tts.connect();
    }

    log.debug('[TTS] Starting speech stream', {
      textLength: text.length,
      modelId,
      voiceId,
      language,
    });

    await client.tts.stream(
      { text, modelId, voiceId, cfgScale, language },
      {
        onChunk: (chunk) => {
          callbacks.onChunk?.({
            audio: chunk.audio,
            index: chunk.index,
            sampleRate: chunk.sampleRate,
          });
        },
        onFinal: (stats) => {
          log.debug('[TTS] Stream completed', {
            chunks: stats.chunks,
            durationMs: stats.durationMs,
            generationMs: stats.generationMs,
          });
          callbacks.onDone?.({
            chunks: stats.chunks,
            durationMs: stats.durationMs,
            generationMs: stats.generationMs,
          });
        },
        onError: (error) => {
          log.error('[TTS] Stream error:', error);
          callbacks.onError?.(error);
        },
      }
    );
  }

  async listVoices(language?: string): Promise<Voice[]> {
    const client = this.getClient();
    log.debug('[TTS] Listing voices', { language });
    const voices = await client.voices.list({ language });
    return voices as Voice[];
  }

  async listModels(): Promise<Model[]> {
    const client = this.getClient();
    log.debug('[TTS] Listing models');
    const models = await client.models.list();
    return models as Model[];
  }
}

const instance = new TTSService();
export default instance;
export { TTSService };
export type { TTSOptions, TTSStreamCallbacks, Voice, Model };
