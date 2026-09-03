import { env } from '../../config/env.js';
import { createLogger } from '../../utils/logger.js';
import { recordOperation } from '../usage/UsageTrackingService.js';
import { Pcm16ToFloat32Stream, pcm16ToWav } from './pcmCodec.js';

const log = createLogger('tts');

/**
 * The vendor default host `api.kugelaudio.com` is geo-routed and may serve a
 * request from outside the EU. The EU host is therefore the default here, so
 * that leaving the EU takes a deliberate `KUGELAUDIO_BASE_URL` override rather
 * than a forgotten one.
 */
const EU_BASE_URL = 'https://api.eu.kugelaudio.com';
const DEFAULT_MODEL = 'kugel-3';
const SAMPLE_RATE = 24000;
/** PCM16 signed LE @ 24 kHz mono — what `pcm_24000` means on the wire. */
const OUTPUT_FORMAT = 'pcm_24000';
const PROVIDER = 'kugelaudio';

interface TTSOptions {
  modelId?: string | undefined;
  voiceId?: string | undefined;
  language?: string | undefined;
  /** Lets the controller stop paying for audio once the client hangs up. */
  signal?: AbortSignal | undefined;
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

function baseUrl(): string {
  return env.KUGELAUDIO_BASE_URL || EU_BASE_URL;
}

function apiKey(): string {
  const key = env.KUGELAUDIO_API_KEY;
  if (!key) {
    throw new Error('Die Sprachausgabe ist nicht konfiguriert (KUGELAUDIO_API_KEY fehlt).');
  }
  return key;
}

/**
 * KugelAudio numbers its voices where Mistral named them, so a caller's
 * `voiceId` string has to become an integer. An unparsable one is logged rather
 * than silently swapped for the default — a wrong voice is the kind of thing
 * nobody files a bug for.
 */
function resolveVoiceId(raw: string | undefined): number | null {
  if (raw !== undefined && raw !== '') {
    const parsed = Number(raw);
    if (Number.isInteger(parsed)) return parsed;
    log.warn('[TTS] Ignoring non-numeric voiceId, falling back to the default', { voiceId: raw });
  }
  return env.KUGELAUDIO_DEFAULT_VOICE_ID ?? null;
}

/**
 * Books what was actually generated, in whole seconds of audio.
 *
 * Seconds rather than input characters because the decoder's work scales with
 * the length of the audio it produces, not with the text it read: "1.250.000 €"
 * is eleven characters and about four seconds of German speech.
 *
 * Also booked when a stream fails part-way — the provider generated those
 * seconds and we consumed them, so counting zero would understate.
 */
function recordSpeech(samples: number, sampleRate: number, model: string): void {
  const seconds = Math.round(samples / sampleRate);
  if (seconds <= 0) return;
  recordOperation({ unit: 'speech_seconds', provider: PROVIDER, model, count: seconds });
}

function buildRequestBody(text: string, options: TTSOptions): Record<string, unknown> {
  const voiceId = resolveVoiceId(options.voiceId);
  return {
    text,
    model_id: options.modelId || DEFAULT_MODEL,
    output_format: OUTPUT_FORMAT,
    ...(voiceId !== null ? { voice_id: voiceId } : {}),
    // Normalisation only with a known language: without one the provider
    // guesses, and a wrongly guessed locale reads numbers and dates aloud
    // incorrectly. The clients have always sent `language` — until now it was
    // destructured nowhere and fell on the floor.
    ...(options.language ? { language: options.language, normalize: true } : {}),
  };
}

/** The clients honour a per-chunk sample rate, so trust the header when sent. */
function resolveSampleRate(response: Response): number {
  const header = Number(response.headers.get('x-sample-rate'));
  return Number.isFinite(header) && header > 0 ? header : SAMPLE_RATE;
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

async function postGenerate(text: string, options: TTSOptions): Promise<Response> {
  const response = await fetch(`${baseUrl()}/v1/tts/generate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildRequestBody(text, options)),
    ...(options.signal ? { signal: options.signal } : {}),
  });

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `KugelAudio antwortete mit ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`
    );
  }

  return response;
}

class TTSService {
  async generateSpeech(text: string, options: TTSOptions = {}): Promise<Buffer> {
    log.debug('[TTS] Generating speech', { textLength: text.length, ...options });

    const response = await postGenerate(text, options);
    const sampleRate = resolveSampleRate(response);
    const pcm = Buffer.from(await response.arrayBuffer());
    // PCM16 is already what a 16-bit WAV stores, so this only prepends a header.
    const wav = pcm16ToWav(pcm, sampleRate);

    recordSpeech(pcm.length / 2, sampleRate, options.modelId || DEFAULT_MODEL);
    log.debug('[TTS] Speech generated', { wavSize: wav.length });

    return wav;
  }

  async streamSpeech(
    text: string,
    options: TTSOptions = {},
    callbacks: TTSStreamCallbacks = {}
  ): Promise<void> {
    log.debug('[TTS] Starting speech stream', { textLength: text.length, ...options });

    const startTime = Date.now();
    const model = options.modelId || DEFAULT_MODEL;
    const codec = new Pcm16ToFloat32Stream();
    let chunkIndex = 0;
    let totalSamples = 0;
    let sampleRate = SAMPLE_RATE;

    try {
      const response = await postGenerate(text, options);
      sampleRate = resolveSampleRate(response);
      const reader = response.body!.getReader();

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value?.length) continue;

        // `Buffer.from(value)` copies; `Buffer.from(value.buffer)` would hand
        // back the reader's whole pooled backing store.
        const audio = codec.push(Buffer.from(value));
        if (audio.length === 0) continue;

        totalSamples += audio.length / 4;
        callbacks.onChunk?.({
          audio: audio.toString('base64'),
          index: chunkIndex++,
          sampleRate,
        });
      }

      if (codec.pendingBytes > 0) {
        log.warn('[TTS] Response ended mid-sample', { bytes: codec.pendingBytes });
      }

      const durationMs = Date.now() - startTime;
      log.debug('[TTS] Stream completed', { chunks: chunkIndex, durationMs });
      callbacks.onDone?.({ chunks: chunkIndex, durationMs });
    } catch (error) {
      // A client that hangs up aborts the request — that is a normal end, not
      // a failure worth showing anyone.
      if (isAbort(error)) {
        log.debug('[TTS] Stream aborted by client', { chunks: chunkIndex });
      } else {
        log.error('[TTS] Stream error:', error);
        callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
      }
    } finally {
      recordSpeech(totalSamples, sampleRate, model);
    }
  }

  async listVoices(language?: string): Promise<Voice[]> {
    log.debug('[TTS] Listing voices', { language });

    const url = new URL('/v1/voices', baseUrl());
    if (language) url.searchParams.set('language', language);

    const response = await fetch(url, { headers: { Authorization: `Bearer ${apiKey()}` } });
    if (!response.ok) {
      throw new Error(`KugelAudio antwortete mit ${response.status}`);
    }

    const data = (await response.json()) as {
      voices?: Array<{
        id: number;
        name?: string;
        supported_languages?: string[];
        gender?: string;
      }>;
    };

    return (data.voices ?? []).map((voice) => ({
      id: String(voice.id),
      name: voice.name || '',
      ...(voice.supported_languages ? { languages: voice.supported_languages } : {}),
      ...(voice.gender ? { gender: voice.gender } : {}),
    }));
  }

  async listModels(): Promise<Model[]> {
    return [{ id: DEFAULT_MODEL, name: 'Kugel 3' }];
  }
}

const instance = new TTSService();
export default instance;
export { TTSService };
export type { TTSOptions, TTSStreamCallbacks, Voice, Model };
