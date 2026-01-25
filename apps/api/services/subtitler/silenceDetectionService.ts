/**
 * Silence Detection Service
 *
 * Detects silence periods in videos for automatic trimming.
 */

import { spawn } from 'child_process';
import { createLogger } from '../../utils/logger.js';
import { ffmpegPath, ffprobe } from './ffmpegWrapper.js';

const log = createLogger('silence-detection');

export const SILENCE_THRESHOLD_DB = -35;
export const MIN_SILENCE_DURATION = 0.5;

interface SilencePeriod {
  start: number;
  end: number;
}

interface SilenceData {
  silencePeriods: SilencePeriod[];
  videoDuration: number;
}

interface DetectionOptions {
  threshold?: number;
  duration?: number;
}

interface TrimPoints {
  trimStart: number;
  trimEnd: number;
  hasTrimming: boolean;
}

async function detectSilence(
  inputPath: string,
  options: DetectionOptions = {}
): Promise<SilenceData> {
  const { threshold = SILENCE_THRESHOLD_DB, duration = MIN_SILENCE_DURATION } = options;

  log.info(
    `Detecting silence in: ${inputPath} (threshold: ${threshold}dB, min duration: ${duration}s)`
  );

  const metadata = await getVideoDuration(inputPath);
  const videoDuration = metadata.duration;

  return new Promise((resolve, reject) => {
    const args = [
      '-i',
      inputPath,
      '-af',
      `silencedetect=n=${threshold}dB:d=${duration}`,
      '-f',
      'null',
      '-',
    ];
    const proc = spawn(ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';

    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on('close', () => {
      const silencePeriods = parseSilenceOutput(stderr);
      log.info(
        `Found ${silencePeriods.length} silence periods in video (duration: ${videoDuration.toFixed(2)}s)`
      );
      resolve({ silencePeriods, videoDuration });
    });

    proc.on('error', (err: Error) => {
      log.error(`Silence detection failed: ${err.message}`);
      reject(err);
    });
  });
}

function parseSilenceOutput(output: string): SilencePeriod[] {
  const silencePeriods: SilencePeriod[] = [];
  const lines = output.split('\n');
  let currentStart: number | null = null;

  for (const line of lines) {
    const startMatch = line.match(/silence_start:\s*([\d.]+)/);
    const endMatch = line.match(/silence_end:\s*([\d.]+)/);

    if (startMatch) {
      currentStart = parseFloat(startMatch[1]);
    }

    if (endMatch && currentStart !== null) {
      silencePeriods.push({ start: currentStart, end: parseFloat(endMatch[1]) });
      currentStart = null;
    }
  }

  if (currentStart !== null) {
    silencePeriods.push({ start: currentStart, end: Infinity });
  }

  return silencePeriods;
}

function calculateTrimPoints(silenceData: SilenceData): TrimPoints {
  const { silencePeriods, videoDuration } = silenceData;
  let trimStart = 0;
  let trimEnd = videoDuration;

  if (silencePeriods.length === 0) {
    log.info('No silence detected - using full video');
    return { trimStart, trimEnd, hasTrimming: false };
  }

  const firstSilence = silencePeriods[0];
  if (firstSilence.start <= 0.1) {
    trimStart = firstSilence.end;
    log.debug(`Trimming ${trimStart.toFixed(2)}s from beginning`);
  }

  const lastSilence = silencePeriods[silencePeriods.length - 1];
  if (lastSilence.end >= videoDuration - 0.1 || lastSilence.end === Infinity) {
    trimEnd = lastSilence.start;
    log.debug(`Trimming from ${trimEnd.toFixed(2)}s to end`);
  }

  const minContentDuration = 1.0;
  if (trimEnd - trimStart < minContentDuration) {
    log.warn('Trim would leave less than 1s of content - using full video');
    return { trimStart: 0, trimEnd: videoDuration, hasTrimming: false };
  }

  const hasTrimming = trimStart > 0 || trimEnd < videoDuration;
  log.info(
    `Trim points: ${trimStart.toFixed(2)}s to ${trimEnd.toFixed(2)}s (trimming: ${hasTrimming})`
  );

  return { trimStart, trimEnd, hasTrimming };
}

async function getVideoDuration(inputPath: string): Promise<{ duration: number }> {
  const metadata = await ffprobe(inputPath);
  const duration = parseFloat(metadata.format.duration ?? '0') || 0;
  return { duration };
}

export { detectSilence, calculateTrimPoints, parseSilenceOutput };
export type { SilencePeriod, SilenceData, DetectionOptions, TrimPoints };
