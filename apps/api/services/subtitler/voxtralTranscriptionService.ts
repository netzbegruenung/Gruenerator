/**
 * Voxtral Transcription Service for Subtitler
 *
 * Uses Mistral's Voxtral model via the existing mistralClient. Voxtral 3 has no
 * word timestamps (`timestamp_granularities: ['word']` answers HTTP 400 "Word-level
 * segments are not enabled for this model", measured 2026-11-05 on Mini and Small),
 * so the word timings subtitle generation needs are estimated from segments —
 * which is why the subtitler puts GreenPT first and keeps Voxtral as failover.
 */

import fs from 'fs';

import { createLogger } from '../../utils/logger.js';
import mistralClient from '../ai/mistralClient.js';
import { type Locale } from '../localization/types.js';
import { toTranscriptionLanguage } from '../transcription/providerPolicy.js';
import { buildContextBias } from '../transcription/transcriptionBias.js';

const log = createLogger('voxtral-transcription');

const VOXTRAL_MODEL = 'voxtral-mini-transcribe-3';

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

/**
 * Spreads a segment's duration over its words in proportion to their length.
 * An estimate, not a measurement: good enough to cut ~2 s subtitle cues, not
 * for word-exact karaoke timing.
 */
function interpolateWordTimestamps(segment: VoxtralSegment): WordTimestamp[] {
  const tokens = segment.text.trim().split(/\s+/).filter(Boolean);
  const totalChars = tokens.reduce((sum, token) => sum + token.length, 0);
  if (totalChars === 0) return [];

  const duration = segment.end - segment.start;
  let cursor = segment.start;
  return tokens.map((token) => {
    const start = cursor;
    cursor += (duration * token.length) / totalChars;
    return { word: token, start, end: cursor };
  });
}

async function transcribeWithVoxtral(
  filePath: string,
  requestWordTimestamps: boolean = false,
  _uploadId: string | null = null,
  locale: Locale = 'de-DE'
): Promise<TranscriptionResult> {
  const stats = fs.statSync(filePath);
  const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  log.debug(`Starting Voxtral transcription (${fileSizeMB} MB)`);

  const audioBuffer = fs.readFileSync(filePath);
  const fileName = filePath.split('/').pop() || 'audio.mp3';

  const response = await mistralClient.audio.transcriptions.complete({
    model: VOXTRAL_MODEL,
    file: { fileName, content: audioBuffer },
    language: toTranscriptionLanguage(locale),
    // Steers spelling of party names, institutions and politicians for the
    // user's country. Voxtral-only.
    contextBias: buildContextBias(locale),
    ...(requestWordTimestamps
      ? { responseFormat: 'verbose_json', timestampGranularities: ['segment'] }
      : {}),
  });

  const resp = response as { text: string; segments?: VoxtralSegment[] };

  log.debug(`Voxtral transcription completed: ${resp.text.length} chars`);

  const words: WordTimestamp[] = [];
  if (requestWordTimestamps && resp.segments) {
    for (const seg of resp.segments) {
      words.push(...interpolateWordTimestamps(seg));
    }
    log.debug(`Interpolated ${words.length} word timestamps from ${resp.segments.length} segments`);
  }

  return {
    text: resp.text,
    ...(words.length > 0 ? { words } : {}),
  };
}

export { transcribeWithVoxtral, interpolateWordTimestamps };
export type { TranscriptionResult, WordTimestamp };
