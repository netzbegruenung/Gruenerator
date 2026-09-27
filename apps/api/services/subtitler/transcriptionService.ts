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
import { type Locale } from '../localization/types.js';
import { GREENPT_STT_MODEL } from '../transcription/greenptListen.js';
import { chooseProvider, type TranscriptionProvider } from '../transcription/providerPolicy.js';
import { recordOperation } from '../usage/UsageTrackingService.js';

import { startBackgroundCompression } from './backgroundCompressionService.js';
import { transcribeWithGreenPT } from './greenptTranscriptionService.js';
import { generateManualSubtitles } from './manualSubtitleGeneratorService.js';
import { extractAudio } from './videoUploadService.js';
import { transcribeWithVoxtral } from './voxtralTranscriptionService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const log = createLogger('transcription');

interface TranscriptionResult {
  text: string;
  words?: Array<{ word: string; start: number; end: number }>;
}

/** What each provider needs and how it is billed, so the loop below stays flat. */
const RUNNERS: Record<
  TranscriptionProvider,
  {
    apiKey: () => string | undefined;
    usage: { provider: string; model: string };
    run: (
      audioPath: string,
      requestWordTimestamps: boolean,
      uploadId: string | null,
      locale: Locale
    ) => Promise<TranscriptionResult>;
  }
> = {
  voxtral: {
    apiKey: () => env.MISTRAL_API_KEY,
    usage: { provider: 'mistral', model: 'voxtral' },
    run: transcribeWithVoxtral,
  },
  greenpt: {
    apiKey: () => env.GREENPT_API_KEY,
    usage: { provider: 'greenpt', model: GREENPT_STT_MODEL },
    run: transcribeWithGreenPT,
  },
};

/**
 * Picks a provider via the shared policy, then works down its chain, skipping
 * providers whose key is unset and retrying the next one on error.
 */
async function transcribeWithProvider(
  audioPath: string,
  requestWordTimestamps: boolean = false,
  uploadId: string | null = null,
  locale: Locale = 'de-DE'
): Promise<TranscriptionResult> {
  const { provider, reason, chain } = chooseProvider({
    override: env.TRANSCRIPTION_PROVIDER,
  });

  // One line per transcription — the only place the provider decision is
  // observable, and infrequent enough not to be noise.
  log.info(`provider=${provider} (${reason}) chain=${chain.join('→')} locale=${locale}`);

  for (const attempt of chain) {
    const runner = RUNNERS[attempt];
    if (!runner.apiKey()) continue;

    try {
      const result = await runner.run(audioPath, requestWordTimestamps, uploadId, locale);
      recordOperation({ unit: 'transcriptions', ...runner.usage });
      return result;
    } catch (error: unknown) {
      log.warn(
        `${attempt} transcription failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  throw new Error(
    'No transcription provider configured. Set MISTRAL_API_KEY (Voxtral) or GREENPT_API_KEY (green-s-pro).'
  );
}

async function transcribeVideo(
  videoPath: string,
  subtitlePreference: string = 'manual',
  locale: Locale = 'de-DE'
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
    } catch (compressionError: unknown) {
      log.warn(
        `Background compression failed for ${uploadId}: ${compressionError instanceof Error ? compressionError.message : String(compressionError)}`
      );
    }

    // Transcription is mode-agnostic: word timestamps are always requested, and
    // `subtitlePreference` ('manual' | 'word') only changes how assSubtitleService
    // lays the segments out later. The old if/else ran identical bodies and its
    // else-branch logged "Unknown mode" for 'word' — a contract-valid value.
    const transcriptionResult = await transcribeWithProvider(audioPath, true, uploadId, locale);

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
