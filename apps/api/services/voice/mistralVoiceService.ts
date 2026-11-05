import { createLogger } from '../../utils/logger.js';
import mistralClient from '../ai/mistralClient.js';
import { type Locale } from '../localization/types.js';
import { buildContextBias, normalizeContextBias } from '../transcription/transcriptionBias.js';

const log = createLogger('mistralVoice');

type TimestampGranularity = 'segment';

/**
 * The request fields Voxtral is picky about, in the one place that talks to it.
 *
 * Both rules were found by running a real 45-minute recording through the
 * protokoll path (2026-07-31) and are enforced here rather than in the two
 * route handlers, because a rule restated in two places is a rule that drifts
 * — which is exactly how the first of them got in.
 *
 *  - DIARIZATION IMPLIES SEGMENT TIMESTAMPS. The routers treat `diarize` and
 *    `timestamps` as independent flags, so `diarize=true, timestamps=false` —
 *    a perfectly ordinary "who said what, I don't need timings" request — sent
 *    an empty granularity list and Voxtral answered HTTP 422: "When diarize is
 *    set to True and streaming is disabled, the timestamp granularity must be
 *    set to ['segment'], got []". That killed speaker identification outright:
 *    the fallback then handed a 45-minute file to another provider, which gave up after
 *    five minutes, and `identifySpeakers` received no `[speaker_N]` marker at
 *    all.
 *  - CONTEXT BIAS IS SINGLE WORDS. See normalizeContextBias. Callers may pass
 *    their own vocabulary, so normalizing only inside `buildContextBias` would
 *    leave the API-supplied path still able to trigger the 400.
 *
 * Without a caller-supplied bias the locale vocabulary applies (#4081). It is
 * resolved here, not in the routes: as `contextBias` it would reach
 * `chooseProvider` as a requested bias and pin every request to Voxtral.
 */
function resolveContextBias(options: TranscriptionOptions): string[] | undefined {
  const { contextBias, locale } = options;
  const terms = contextBias?.length ? contextBias : locale ? buildContextBias(locale) : [];
  const bias = normalizeContextBias(terms);
  return bias.length ? bias : undefined;
}

function voxtralRequestFields(options: TranscriptionOptions): {
  language: string | undefined;
  timestampGranularities: TimestampGranularity[] | undefined;
  diarize: boolean | undefined;
  contextBias: string[] | undefined;
} {
  const { language, timestamp_granularities, diarize } = options;
  const granularities = diarize ? (['segment'] as TimestampGranularity[]) : timestamp_granularities;

  return {
    language: language || undefined,
    timestampGranularities: granularities?.length ? granularities : undefined,
    diarize: diarize || undefined,
    contextBias: resolveContextBias(options),
  };
}

/**
 * Voxtral Mini Transcribe 3 (alias of `voxtral-mini-transcribe-3-0`), the
 * successor of the retired `voxtral-mini-2602`. Pinned to the `-3` alias rather
 * than `-latest`, so a generation change stays a deliberate edit here.
 */
const VOXTRAL_TRANSCRIBE_MODEL = 'voxtral-mini-transcribe-3';
const VOXTRAL_STREAM_MODEL = 'voxtral-mini-transcribe-3';

interface TranscriptionOptions {
  language?: string;
  timestamp_granularities?: TimestampGranularity[];
  removeTimestamps?: boolean;
  diarize?: boolean;
  contextBias?: string[];
  /** Picks the default vocabulary when `contextBias` is empty. */
  locale?: Locale;
}

interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
  speakerId?: string | null;
  speaker_id?: string | null;
}

interface TranscriptionResult {
  text: string;
  hasTimestamps: boolean;
  segments?: TranscriptionSegment[];
}

interface MistralTranscriptionResponse {
  text?: string;
  segments?: TranscriptionSegment[];
}

class MistralVoiceService {
  async transcribeFromBuffer(
    audioBuffer: Buffer,
    filename: string,
    options: TranscriptionOptions = {}
  ): Promise<TranscriptionResult> {
    try {
      const fields = voxtralRequestFields(options);

      log.debug('[Mistral Voice] Starting transcription with options:', {
        language: fields.language,
        timestamp_granularities: fields.timestampGranularities,
        diarize: fields.diarize,
        filename,
      });

      const transcriptionResponse = await mistralClient.audio.transcriptions.complete({
        model: VOXTRAL_TRANSCRIBE_MODEL,
        file: {
          fileName: filename,
          content: audioBuffer,
        },
        ...fields,
      });

      const resp = transcriptionResponse as MistralTranscriptionResponse;
      log.debug('[Mistral Voice] Response keys:', Object.keys(resp));
      log.debug(
        '[Mistral Voice] Has segments:',
        !!resp.segments,
        'count:',
        resp.segments?.length ?? 0
      );
      if (resp.segments?.[0]) {
        log.debug('[Mistral Voice] First segment keys:', Object.keys(resp.segments[0]));
        log.debug(
          '[Mistral Voice] First segment sample:',
          JSON.stringify(resp.segments[0]).slice(0, 300)
        );
      }
      log.debug('[Mistral Voice] Text sample:', resp.text?.slice(0, 200));
      return this._formatResponse(transcriptionResponse as MistralTranscriptionResponse, options);
    } catch (error) {
      // The SDK's MistralError carries the HTTP status as `statusCode` and the
      // raw response body as `body`; there is no `response` object.
      const err = error as Error & { statusCode?: number; body?: string };
      log.error('[Mistral Voice] Transcription error details:', {
        message: err.message,
        stack: err.stack,
        response: err.body || 'No response data',
        status: err.statusCode || 'No status',
      });
      throw new Error(`Transcription failed: ${err.message}`);
    }
  }

  private _formatResponse(
    transcriptionResponse: MistralTranscriptionResponse | string,
    options: TranscriptionOptions
  ): TranscriptionResult {
    if (!transcriptionResponse) {
      throw new Error('No transcription response received');
    }

    let text: string;
    let segments: TranscriptionSegment[] | undefined;

    if (typeof transcriptionResponse === 'string') {
      text = transcriptionResponse;
    } else {
      text = transcriptionResponse.text || '';
      segments = transcriptionResponse.segments;
    }

    const result: TranscriptionResult = {
      text: text,
      hasTimestamps: false,
    };

    log.debug(
      '[Mistral Voice] _formatResponse: segments?',
      !!segments,
      'isArray?',
      Array.isArray(segments),
      'count:',
      segments?.length ?? 0
    );
    if (segments && Array.isArray(segments)) {
      result.segments = segments;
      result.hasTimestamps = true;

      const speakerIds = segments.map((s) => s.speakerId ?? s.speaker_id ?? null);
      const hasSpeakers = speakerIds.some(Boolean);
      log.debug('[Mistral Voice] Speaker IDs sample:', speakerIds.slice(0, 5));
      log.debug('[Mistral Voice] hasSpeakers:', hasSpeakers);

      if (hasSpeakers) {
        result.text = segments
          .map((s) => {
            const id = s.speakerId ?? s.speaker_id;
            return id ? `[${id}] ${s.text.trim()}` : s.text.trim();
          })
          .join('\n');
        log.debug(
          '[Mistral Voice] Built diarized text, first 200 chars:',
          result.text.slice(0, 200)
        );
      }
    }

    if (options.removeTimestamps && result.hasTimestamps) {
      result.text = this._cleanTimestamps(result.text);
      result.hasTimestamps = false;
    }

    return result;
  }

  private _cleanTimestamps(text: string): string {
    if (!text) return '';

    return text
      .replace(/\[\d{2}:\d{2}(:\d{2})?\.\d{3} --> \d{2}:\d{2}(:\d{2})?\.\d{3}\]\s*/g, '')
      .replace(/\d{2}:\d{2}:\d{2}\s*-\s*\d{2}:\d{2}:\d{2}\s*/g, '')
      .replace(/\d{2}:\d{2}\s*-\s*\d{2}:\d{2}\s*/g, '')
      .replace(/\[\d{2}:\d{2}(:\d{2})?\.\d{3}\]\s*/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  getSupportedFormats(): string[] {
    return [
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/m4a',
      'audio/aac',
      'audio/ogg',
      'audio/webm',
      'audio/flac',
    ];
  }

  isFormatSupported(mimetype: string): boolean {
    return this.getSupportedFormats().includes(mimetype);
  }

  async *transcribeFromBufferStream(
    audioBuffer: Buffer,
    filename: string,
    options: Pick<TranscriptionOptions, 'language' | 'contextBias' | 'locale'> = {}
  ): AsyncGenerator<{ type: string; text: string }> {
    try {
      log.debug('[Mistral Voice] Starting streaming transcription for:', filename);

      const stream = await mistralClient.audio.transcriptions.stream({
        model: VOXTRAL_STREAM_MODEL,
        file: {
          fileName: filename,
          content: audioBuffer,
        },
        language: options.language || undefined,
        contextBias: resolveContextBias(options),
      });

      const chunks: string[] = [];

      // The SDK wraps every SSE event as `{ event, data }`; the payload with
      // `type` and `text` sits in `data`.
      for await (const { data } of stream) {
        if (data.type === 'transcription.text.delta') {
          chunks.push(data.text);
          yield { type: 'text.delta', text: data.text };
        } else if (data.type === 'transcription.done') {
          yield { type: 'done', text: chunks.join('') };
        }
      }
    } catch (error) {
      const err = error as Error;
      log.error('[Mistral Voice] Streaming transcription error:', err);
      throw new Error(`Streaming transcription failed: ${err.message}`);
    }
  }
}

const instance = new MistralVoiceService();
export default instance;
export { MistralVoiceService };
export type { TranscriptionOptions, TranscriptionResult, TranscriptionSegment };
