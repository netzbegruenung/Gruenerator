/**
 * GreenPT Transcription Service (subtitler shape)
 *
 * Thin adapter over the shared /v1/listen client: file path in, transcript plus
 * word timestamps out.
 */

import fs from 'fs';

import { createLogger } from '../../utils/logger.js';
import { type Locale } from '../localization/types.js';
import { listenWithGreenpt } from '../transcription/greenptListen.js';

const log = createLogger('greenpt-transcription');

interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

interface TranscriptionResult {
  text: string;
  words?: WordTimestamp[];
}

async function transcribeWithGreenPT(
  filePath: string,
  requestWordTimestamps: boolean = false,
  _uploadId: string | null = null,
  // green-s-pro detects the language itself (language=multi), so de-DE and
  // de-AT need no distinction here — unlike Whisper, which rejects regional codes.
  _locale: Locale = 'de-DE'
): Promise<TranscriptionResult> {
  const stats = fs.statSync(filePath);
  log.debug(`Starting GreenPT transcription (${(stats.size / (1024 * 1024)).toFixed(2)} MB)`);

  const fileName = filePath.split('/').pop() || 'audio.mp3';
  const { text, words } = await listenWithGreenpt(fs.readFileSync(filePath), fileName);

  if (!requestWordTimestamps || words.length === 0) {
    return { text };
  }

  return {
    text,
    words: words.map((w) => ({ word: w.word, start: w.start, end: w.end })),
  };
}

export { transcribeWithGreenPT };
export type { TranscriptionResult, WordTimestamp };
