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

interface AIWorkerPool {
  processRequest(request: any): Promise<any>;
}

/**
 * Provider chain: regolo faster-whisper (default) → voxtral (fallback)
 * Override with TRANSCRIPTION_PROVIDER env var: regolo | voxtral
 */
async function transcribeWithProvider(
  audioPath: string,
  requestWordTimestamps: boolean = false,
  uploadId: string | null = null
): Promise<TranscriptionResult> {
  const provider = process.env.TRANSCRIPTION_PROVIDER || 'regolo';

  if (provider === 'regolo' && process.env.REGOLO_API_KEY) {
    log.debug('Using Regolo (faster-whisper) for transcription');
    try {
      return await transcribeWithRegolo(audioPath, requestWordTimestamps, uploadId);
    } catch (error: any) {
      log.warn(`Regolo transcription failed: ${error.message}`);
    }
  }

  if ((provider === 'voxtral' || provider === 'regolo') && process.env.MISTRAL_API_KEY) {
    log.debug('Using Voxtral for transcription');
    try {
      return await transcribeWithVoxtral(audioPath, requestWordTimestamps, uploadId);
    } catch (error: any) {
      log.warn(`Voxtral transcription failed: ${error.message}`);
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
