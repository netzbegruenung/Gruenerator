/**
 * Voxtral Transcription Service for Subtitler
 *
 * Uses Mistral's Voxtral model via the existing mistralClient for
 * word-level transcription needed by subtitle generation.
 */

import fs from 'fs';

import { createLogger } from '../../utils/logger.js';
import mistralClient from '../../workers/mistralClient.js';

const log = createLogger('voxtral-transcription');

const VOXTRAL_MODEL = 'voxtral-mini-latest';

interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

interface TranscriptionResult {
  text: string;
  words?: WordTimestamp[];
}

interface VoxtralSegment {
  text: string;
  start: number;
  end: number;
  speaker_id?: string | null;
  type?: string;
}

async function transcribeWithVoxtral(
  filePath: string,
  requestWordTimestamps: boolean = false,
  _uploadId: string | null = null
): Promise<TranscriptionResult> {
  const stats = fs.statSync(filePath);
  const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  log.debug(`Starting Voxtral transcription (${fileSizeMB} MB)`);

  const audioBuffer = fs.readFileSync(filePath);
  const fileName = filePath.split('/').pop() || 'audio.mp3';

  const response = await mistralClient.audio.transcriptions.complete({
    model: VOXTRAL_MODEL,
    file: { fileName, content: audioBuffer },
    language: 'de',
    ...(requestWordTimestamps
      ? { responseFormat: 'verbose_json', timestampGranularities: ['word'] }
      : {}),
  });

  const resp = response as { text: string; segments?: VoxtralSegment[] };

  log.debug(`Voxtral transcription completed: ${resp.text.length} chars`);

  const words: WordTimestamp[] = [];
  if (requestWordTimestamps && resp.segments) {
    for (const seg of resp.segments) {
      words.push({ word: seg.text.trim(), start: seg.start, end: seg.end });
    }
    log.debug(`Extracted ${words.length} word timestamps`);
  }

  return {
    text: resp.text,
    ...(words.length > 0 ? { words } : {}),
  };
}

export { transcribeWithVoxtral };
export type { TranscriptionResult, WordTimestamp };
