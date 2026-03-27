/**
 * Regolo Transcription Service
 *
 * Uses Regolo's OpenAI-compatible /v1/audio/transcriptions endpoint
 * with the faster-whisper-large-v3 model.
 */

import fs from 'fs';

import { createLogger } from '../../utils/logger.js';

const log = createLogger('regolo-transcription');

const REGOLO_BASE_URL = 'https://api.regolo.ai/v1';

interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

interface TranscriptionResult {
  text: string;
  words?: WordTimestamp[];
}

interface WhisperSegment {
  start: number;
  end: number;
  text: string;
  words?: Array<{ word: string; start: number; end: number }>;
}

interface WhisperVerboseResponse {
  text: string;
  segments?: WhisperSegment[];
}

async function transcribeWithRegolo(
  filePath: string,
  requestWordTimestamps: boolean = false,
  _uploadId: string | null = null
): Promise<TranscriptionResult> {
  const apiKey = process.env.REGOLO_API_KEY;
  if (!apiKey) {
    throw new Error('REGOLO_API_KEY is not configured');
  }

  const stats = fs.statSync(filePath);
  const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  log.debug(`Starting Regolo transcription (${fileSizeMB} MB)`);

  const fileBuffer = fs.readFileSync(filePath);
  const fileName = filePath.split('/').pop() || 'audio.wav';
  const blob = new Blob([fileBuffer], { type: 'audio/wav' });

  const form = new FormData();
  form.append('file', blob, fileName);
  form.append('model', 'faster-whisper-large-v3');
  form.append('language', 'de');

  if (requestWordTimestamps) {
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'word');
  }

  const response = await fetch(`${REGOLO_BASE_URL}/audio/transcriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Regolo transcription failed (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as WhisperVerboseResponse;

  log.debug(`Regolo transcription completed: ${data.text.length} chars`);

  const words: WordTimestamp[] = [];
  if (requestWordTimestamps && data.segments) {
    for (const segment of data.segments) {
      if (segment.words) {
        for (const w of segment.words) {
          words.push({ word: w.word.trim(), start: w.start, end: w.end });
        }
      }
    }
    log.debug(`Extracted ${words.length} word timestamps`);
  }

  return {
    text: data.text,
    ...(words.length > 0 ? { words } : {}),
  };
}

export { transcribeWithRegolo };
export type { TranscriptionResult, WordTimestamp };
