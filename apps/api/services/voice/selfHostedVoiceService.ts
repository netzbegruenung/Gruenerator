/**
 * Self-hosted Voxtral transcription service.
 * Calls the Voxtral sidecar container for privacy-sensitive transcription.
 * Audio never leaves the infrastructure.
 */

import { createLogger } from '../../utils/logger.js';

import type { TranscriptionResult, TranscriptionSegment } from './mistralVoiceService.js';

const log = createLogger('selfHostedVoice');

const VOXTRAL_BASE_URL = process.env.VOXTRAL_SELF_HOSTED_URL || 'http://voxtral:8000';

interface SelfHostedTranscriptionOptions {
  language?: string;
  timestamps?: boolean;
}

interface SelfHostedResponse {
  text: string;
  segments: Array<{ start: number; end: number; text: string }>;
  has_timestamps: boolean;
  error?: string;
}

export async function transcribeFromBuffer(
  buffer: Buffer,
  filename: string,
  options: SelfHostedTranscriptionOptions = {}
): Promise<TranscriptionResult> {
  const startTime = Date.now();

  try {
    log.debug('[SelfHostedVoice] Starting transcription:', { filename, ...options });

    const formData = new FormData();
    formData.append('audio', new Blob([new Uint8Array(buffer)]), filename);
    formData.append('language', options.language || 'de');
    formData.append('timestamps', String(options.timestamps ?? false));

    const response = await fetch(`${VOXTRAL_BASE_URL}/transcribe`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown');
      throw new Error(`Voxtral API returned ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as SelfHostedResponse;

    if (data.error) {
      throw new Error(data.error);
    }

    const elapsed = Date.now() - startTime;
    log.info(
      `[SelfHostedVoice] Transcription completed in ${elapsed}ms (${data.text.length} chars)`
    );

    const result: TranscriptionResult = {
      text: data.text,
      hasTimestamps: data.has_timestamps,
    };

    if (data.segments && data.segments.length > 0) {
      result.segments = data.segments as TranscriptionSegment[];
    }

    return result;
  } catch (error: unknown) {
    const elapsed = Date.now() - startTime;
    const err = error as Error;
    log.error(`[SelfHostedVoice] Transcription FAILED after ${elapsed}ms:`, {
      errorMessage: err.message,
      filename,
    });
    throw new Error(`Self-hosted transcription failed: ${err.message}`);
  }
}

export async function isAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${VOXTRAL_BASE_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;
    const data = (await response.json()) as { status: string };
    return data.status === 'ok';
  } catch {
    return false;
  }
}
