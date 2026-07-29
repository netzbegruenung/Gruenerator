/**
 * Transcription Service
 *
 * Orchestrates video transcription: audio extraction, provider selection, and subtitle generation.
 */

import fs from 'fs/promises';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

import { env } from '../../config/env.js';
import { createLogger } from '../../utils/logger.js';
import { type AIWorkerPool } from '../../workers/types.js';
import { type Locale } from '../localization/types.js';
import { probeDurationSeconds } from '../transcription/audioDuration.js';
import { chooseProvider, type TranscriptionProvider } from '../transcription/providerPolicy.js';
import { recordOperation } from '../usage/UsageTrackingService.js';

import { startBackgroundCompression } from './backgroundCompressionService.js';
import { generateManualSubtitles } from './manualSubtitleGeneratorService.js';
import { transcribeWithRegolo } from './regoloTranscriptionService.js';
import { extractAudio } from './videoUploadService.js';
import { transcribeWithVoxtral } from './voxtralTranscriptionService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const log = createLogger('transcription');

interface TranscriptionResult {
  text: string;
  words?: Array<{ word: string; start: number; end: number }>;
}

/**
 * Picks a provider via the shared policy (duration → Regolo under 2 min,
 * Voxtral at or above), then falls back to the other one if the first errors.
 */
async function transcribeWithProvider(
  audioPath: string,
  requestWordTimestamps: boolean = false,
  uploadId: string | null = null,
  locale: Locale = 'de-DE',
  durationSeconds: number | null = null
): Promise<TranscriptionResult> {
  const { provider, reason } = chooseProvider({
    durationSeconds,
    override: env.TRANSCRIPTION_PROVIDER,
  });

  // One line per transcription — the only place the provider decision is
  // observable, and infrequent enough not to be noise.
  log.info(
    `provider=${provider} (${reason}) duration=${durationSeconds === null ? 'unknown' : `${Math.round(durationSeconds)}s`} locale=${locale}`
  );

  const attempts: TranscriptionProvider[] =
    provider === 'regolo' ? ['regolo', 'voxtral'] : ['voxtral', 'regolo'];

  for (const attempt of attempts) {
    if (attempt === 'regolo' && env.REGOLO_API_KEY) {
      try {
        const result = await transcribeWithRegolo(
          audioPath,
          requestWordTimestamps,
          uploadId,
          locale
        );
        recordOperation({ unit: 'transcriptions', provider: 'regolo', model: 'faster-whisper' });
        return result;
      } catch (error: unknown) {
        log.warn(
          `Regolo transcription failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    if (attempt === 'voxtral' && env.MISTRAL_API_KEY) {
      try {
        const result = await transcribeWithVoxtral(
          audioPath,
          requestWordTimestamps,
          uploadId,
          locale
        );
        recordOperation({ unit: 'transcriptions', provider: 'mistral', model: 'voxtral' });
        return result;
      } catch (error: unknown) {
        log.warn(
          `Voxtral transcription failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  throw new Error(
    'No transcription provider configured. Set REGOLO_API_KEY (faster-whisper) or MISTRAL_API_KEY (Voxtral).'
  );
}

async function transcribeVideo(
  videoPath: string,
  subtitlePreference: string = 'manual',
  aiWorkerPool?: AIWorkerPool,
  locale: Locale = 'de-DE',
  /** Known media length; probed from the extracted audio when omitted. */
  durationSeconds: number | null = null
): Promise<string> {
  try {
    log.debug(`Transkription Start - Modus: ${subtitlePreference}`);

    const outputDir = path.join(__dirname, '../../uploads/transcriptions');
    await fs.mkdir(outputDir, { recursive: true });
    const audioPath = path.join(outputDir, `audio_${Date.now()}.mp3`);

    await extractAudio(videoPath, audioPath);

    // Probe the extracted audio when the caller didn't already know the length
    // (autoProcessingService does, from its own metadata pass).
    const effectiveDuration = durationSeconds ?? (await probeDurationSeconds(audioPath));

    const uploadId = path.basename(path.dirname(videoPath));
    try {
      startBackgroundCompression(videoPath, uploadId);
      log.debug(`Background compression started for: ${uploadId}`);
    } catch (compressionError: unknown) {
      log.warn(
        `Background compression failed for ${uploadId}: ${compressionError instanceof Error ? compressionError.message : String(compressionError)}`
      );
    }

    // Transcription is mode-agnostic: word timestamps are always requested, and
    // `subtitlePreference` ('manual' | 'word') only changes how assSubtitleService
    // lays the segments out later. The old if/else ran identical bodies and its
    // else-branch logged "Unknown mode" for 'word' — a contract-valid value.
    const transcriptionResult = await transcribeWithProvider(
      audioPath,
      true,
      uploadId,
      locale,
      effectiveDuration
    );

    if (!transcriptionResult || typeof transcriptionResult.text !== 'string') {
      throw new Error('Invalid transcription data received from provider');
    }

    log.debug(
      `Provider Wörter: ${transcriptionResult.words?.length || 0}, Text: ${transcriptionResult.text.length} chars`
    );

    const finalTranscription = await generateManualSubtitles(
      transcriptionResult.text,
      transcriptionResult.words || []
    );

    try {
      await fs.unlink(audioPath);
    } catch (err: unknown) {
      log.warn(`Audio cleanup failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (!finalTranscription) {
      throw new Error('Keine Transkription vom Provider erhalten oder verarbeitet');
    }

    const segments = finalTranscription.split('\n\n');
    log.info(`Finale Segmente: ${segments.length}`);

    return finalTranscription;
  } catch (error: unknown) {
    log.error(
      `Fehler (Modus: ${subtitlePreference}): ${error instanceof Error ? error.message : String(error)}`
    );
    throw error;
  }
}

export { transcribeVideo, transcribeWithProvider };
export type { TranscriptionResult };
export type { AIWorkerPool } from '../../workers/types.js';
