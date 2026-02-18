/**
 * Transcription Service
 *
 * Orchestrates video transcription: audio extraction, provider selection, and subtitle generation.
 */

import fs from 'fs/promises';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

import { createLogger } from '../../utils/logger.js';

import { startBackgroundCompression } from './backgroundCompressionService.js';
import { transcribeWithGladia } from './gladiaService.js';
import { generateManualSubtitles } from './manualSubtitleGeneratorService.js';
import { extractAudio } from './videoUploadService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const log = createLogger('transcription');

interface TranscriptionResult {
  text: string;
  words?: Array<{ word: string; start: number; end: number }>;
}

interface AIWorkerPool {
  processRequest(request: any): Promise<any>;
}

async function transcribeWithProvider(
  audioPath: string,
  requestWordTimestamps: boolean = false,
  uploadId: string | null = null
): Promise<TranscriptionResult> {
  log.debug('Using Gladia for transcription');

  try {
    return await transcribeWithGladia(audioPath, requestWordTimestamps, uploadId);
  } catch (error: any) {
    if (error.message === 'CANCELLED') {
      log.info(`Transcription cancelled for upload: ${uploadId}`);
    }
    throw error;
  }
}

async function transcribeVideo(
  videoPath: string,
  subtitlePreference: string = 'manual',
  aiWorkerPool?: AIWorkerPool,
  language: string = 'de'
): Promise<string> {
  try {
    log.debug(`Transkription Start - Modus: ${subtitlePreference}`);

    const outputDir = path.join(__dirname, '../../uploads/transcriptions');
    await fs.mkdir(outputDir, { recursive: true });
    const audioPath = path.join(outputDir, `audio_${Date.now()}.mp3`);

    await extractAudio(videoPath, audioPath);

    const uploadId = path.basename(path.dirname(videoPath));
    try {
      startBackgroundCompression(videoPath, uploadId);
      log.debug(`Background compression started for: ${uploadId}`);
    } catch (compressionError: any) {
      log.warn(`Background compression failed for ${uploadId}: ${compressionError.message}`);
    }

    let finalTranscription: string | null = null;

    if (subtitlePreference === 'manual') {
      const transcriptionResult = await transcribeWithProvider(audioPath, true, uploadId);

      if (!transcriptionResult || typeof transcriptionResult.text !== 'string') {
        throw new Error('Invalid transcription data received from provider');
      }

      log.debug(
        `Provider Wörter: ${transcriptionResult.words?.length || 0}, Text: ${transcriptionResult.text.length} chars`
      );

      finalTranscription = await generateManualSubtitles(
        transcriptionResult.text,
        transcriptionResult.words || []
      );
    } else {
      log.warn(`Unknown mode '${subtitlePreference}', using manual mode as fallback`);
      const transcriptionResult = await transcribeWithProvider(audioPath, true, uploadId);

      if (!transcriptionResult || typeof transcriptionResult.text !== 'string') {
        throw new Error('Invalid transcription data received from provider');
      }

      log.debug(
        `Provider Wörter: ${transcriptionResult.words?.length || 0}, Text: ${transcriptionResult.text.length} chars`
      );

      finalTranscription = await generateManualSubtitles(
        transcriptionResult.text,
        transcriptionResult.words || []
      );
    }

    try {
      await fs.unlink(audioPath);
    } catch (err: any) {
      log.warn(`Audio cleanup failed: ${err.message}`);
    }

    if (!finalTranscription) {
      throw new Error('Keine Transkription vom Provider erhalten oder verarbeitet');
    }

    const segments = finalTranscription.split('\n\n');
    log.info(`Finale Segmente: ${segments.length}`);

    return finalTranscription;
  } catch (error: any) {
    log.error(`Fehler (Modus: ${subtitlePreference}): ${error.message}`);
    throw error;
  }
}

export { transcribeVideo, transcribeWithProvider };
export type { TranscriptionResult, AIWorkerPool };
