import { createLogger } from '../../utils/logger.js';
import mistralClient from '../../workers/mistralClient.js';

const log = createLogger('mistralVoice');

type TimestampGranularity = 'segment';

/**
 * Voxtral model variants:
 * - voxtral-mini-transcribe-latest: Optimized for pure transcription (fastest, cheapest)
 * - voxtral-mini-latest: Mini (3B) — transcription + understanding + function calling
 * - voxtral-small-latest: Small (24B) — highest quality understanding + translation
 */
const VOXTRAL_TRANSCRIBE_MODEL = 'voxtral-mini-transcribe-latest';
const VOXTRAL_CHAT_MODEL = 'voxtral-small-latest';

interface TranscriptionOptions {
  language?: string;
  timestamp_granularities?: TimestampGranularity[];
  removeTimestamps?: boolean;
  diarize?: boolean;
  contextBias?: string[];
}

interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
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

interface ChatOptions {
  model?: string;
}

class MistralVoiceService {
  async transcribeFromBuffer(
    audioBuffer: Buffer,
    filename: string,
    options: TranscriptionOptions = {}
  ): Promise<TranscriptionResult> {
    try {
      const { language, timestamp_granularities, diarize, contextBias } = options;

      log.debug('[Mistral Voice] Starting transcription with options:', {
        language,
        timestamp_granularities,
        diarize,
        filename,
      });

      const transcriptionResponse = await mistralClient.audio.transcriptions.complete({
        model: VOXTRAL_TRANSCRIBE_MODEL,
        file: {
          fileName: filename,
          content: audioBuffer,
        },
        language: language || undefined,
        timestampGranularities: timestamp_granularities || undefined,
        diarize: diarize || undefined,
        contextBias: contextBias || undefined,
      });

      log.debug('[Mistral Voice] Transcription response received:', transcriptionResponse);
      return this._formatResponse(transcriptionResponse as MistralTranscriptionResponse, options);
    } catch (error) {
      const err = error as Error & { response?: { data?: unknown; status?: number } };
      log.error('[Mistral Voice] Transcription error details:', {
        message: err.message,
        stack: err.stack,
        response: err.response?.data || 'No response data',
        status: err.response?.status || 'No status',
      });
      throw new Error(`Transcription failed: ${err.message}`);
    }
  }

  async transcribeFromUrl(
    audioUrl: string,
    options: TranscriptionOptions = {}
  ): Promise<TranscriptionResult> {
    try {
      const { language, timestamp_granularities, diarize, contextBias } = options;

      log.debug('[Mistral Voice] Starting URL transcription for:', audioUrl);

      // Use Voxtral's native fileUrl support — avoids downloading the file ourselves
      const transcriptionResponse = await mistralClient.audio.transcriptions.complete({
        model: VOXTRAL_TRANSCRIBE_MODEL,
        fileUrl: audioUrl,
        language: language || undefined,
        timestampGranularities: timestamp_granularities || undefined,
        diarize: diarize || undefined,
        contextBias: contextBias || undefined,
      });

      log.debug('[Mistral Voice] URL transcription response received:', transcriptionResponse);
      return this._formatResponse(transcriptionResponse as MistralTranscriptionResponse, options);
    } catch (error) {
      const err = error as Error & { response?: { data?: unknown; status?: number } };
      log.error('[Mistral Voice] URL transcription error details:', {
        message: err.message,
        stack: err.stack,
        response: err.response?.data || 'No response data',
        status: err.response?.status || 'No status',
      });
      throw new Error(`URL transcription failed: ${err.message}`);
    }
  }

  async chatWithAudio(
    audioBuffer: Buffer,
    filename: string,
    prompt: string,
    options: ChatOptions = {}
  ): Promise<string> {
    try {
      const audioBase64 = audioBuffer.toString('base64');

      const chatResponse = await mistralClient.chat.complete({
        model: VOXTRAL_CHAT_MODEL,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'input_audio',
                inputAudio: audioBase64,
              },
              {
                type: 'text',
                text: prompt || "What's in this audio file?",
              },
            ],
          },
        ],
      });

      const message = chatResponse.choices?.[0]?.message;
      return typeof message?.content === 'string' ? message.content : '';
    } catch (error) {
      const err = error as Error;
      log.error('[Mistral Voice] Chat error:', err);
      throw new Error(`Audio chat failed: ${err.message}`);
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

    if (segments && Array.isArray(segments)) {
      result.segments = segments;
      result.hasTimestamps = true;
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
}

const instance = new MistralVoiceService();
export default instance;
export { MistralVoiceService };
export type { TranscriptionOptions, TranscriptionResult, TranscriptionSegment };
