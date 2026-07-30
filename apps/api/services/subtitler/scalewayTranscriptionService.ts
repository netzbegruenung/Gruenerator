/**
 * Scaleway Transcription Service
 *
 * Uses Scaleway's OpenAI-compatible /v1/audio/transcriptions endpoint with the
 * whisper-large-v3 model.
 *
 * SEGMENT TIMESTAMPS ONLY. Measured 2026-07-30: this endpoint answers
 * `timestamp_granularities[]=word` with `words: null` and populates `segments`
 * instead, so it cannot drive word-by-word subtitles. `providerPolicy` keeps it
 * out of the chain whenever a caller needs word timings — see
 * WORD_TIMESTAMP_CHAIN there for why that decision cannot be deferred to the
 * fallback loop.
 */

import fs from 'fs';

import { createLogger } from '../../utils/logger.js';
import { scalewayBaseUrl, SCALEWAY_WHISPER_MODEL } from '../ai/scalewayEndpoint.js';
import { type Locale } from '../localization/types.js';
import { mimeTypeFromFilename } from '../transcription/mimeTypes.js';
import { toWhisperLanguage } from '../transcription/providerPolicy.js';

const log = createLogger('scaleway-transcription');

interface WhisperSegment {
  start: number;
  end: number;
  text: string;
}

interface WhisperVerboseResponse {
  text: string;
  segments?: WhisperSegment[];
}

interface TranscriptionResult {
  text: string;
  words?: Array<{ word: string; start: number; end: number }>;
}

async function transcribeWithScaleway(
  filePath: string,
  _requestWordTimestamps: boolean = false,
  _uploadId: string | null = null,
  locale: Locale = 'de-DE'
): Promise<TranscriptionResult> {
  const apiKey = process.env.SCALEWAY_API_KEY;
  if (!apiKey) {
    throw new Error('SCALEWAY_API_KEY is not configured');
  }

  const stats = fs.statSync(filePath);
  log.debug(`Starting Scaleway transcription (${(stats.size / (1024 * 1024)).toFixed(2)} MB)`);

  const fileBuffer = fs.readFileSync(filePath);
  const fileName = filePath.split('/').pop() || 'audio.mp3';
  const blob = new Blob([fileBuffer], { type: mimeTypeFromFilename(fileName) });

  const form = new FormData();
  form.append('file', blob, fileName);
  form.append('model', SCALEWAY_WHISPER_MODEL);
  // Same ISO-639-1 constraint as Regolo: 'de-AT' is rejected (measured: HTTP
  // 400), so both locales resolve to 'de'. See toWhisperLanguage.
  form.append('language', toWhisperLanguage(locale));

  const response = await fetch(`${scalewayBaseUrl()}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Scaleway transcription failed (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as WhisperVerboseResponse;

  log.debug(`Scaleway transcription completed: ${data.text.length} chars`);

  // No `words` key in the return value, deliberately: the caller's word list
  // stays empty rather than being faked from segment boundaries, so downstream
  // subtitle layout falls back to its own timing instead of trusting invented
  // per-word timings.
  return { text: data.text };
}

export { transcribeWithScaleway };
export type { TranscriptionResult };
