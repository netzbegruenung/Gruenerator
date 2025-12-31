const { spawn } = require('child_process');
const { createLogger } = require('../../../utils/logger.js');
const { ffmpegPath, ffprobe } = require('./ffmpegWrapper.js');

const log = createLogger('silence-detection');

const SILENCE_THRESHOLD_DB = -35;
const MIN_SILENCE_DURATION = 0.5;

/**
 * Detect silence periods in a video using FFmpeg silencedetect filter
 * @param {string} inputPath - Path to input video
 * @param {Object} options - Detection options
 * @returns {Promise<Object>} - { silencePeriods: [{start, end}], videoDuration }
 */
async function detectSilence(inputPath, options = {}) {
  const {
    threshold = SILENCE_THRESHOLD_DB,
    duration = MIN_SILENCE_DURATION
  } = options;

  log.info(`Detecting silence in: ${inputPath} (threshold: ${threshold}dB, min duration: ${duration}s)`);

  const metadata = await getVideoDuration(inputPath);
  const videoDuration = metadata.duration;

  return new Promise((resolve, reject) => {
    const args = [
      '-i', inputPath,
      '-af', `silencedetect=n=${threshold}dB:d=${duration}`,
      '-f', 'null',
      '-'
    ];

    const proc = spawn(ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('close', (code) => {
      const silencePeriods = parseSilenceOutput(stderr);

      log.info(`Found ${silencePeriods.length} silence periods in video (duration: ${videoDuration.toFixed(2)}s)`);

      resolve({
        silencePeriods,
        videoDuration
      });
    });

    proc.on('error', (err) => {
      log.error(`Silence detection failed: ${err.message}`);
      reject(err);
    });
  });
}

/**
 * Parse FFmpeg silencedetect output
 * @param {string} output - FFmpeg stderr output
 * @returns {Array} - Array of {start, end} objects
 */
function parseSilenceOutput(output) {
  const silencePeriods = [];
  const lines = output.split('\n');

  let currentStart = null;

  for (const line of lines) {
    const startMatch = line.match(/silence_start:\s*([\d.]+)/);
    const endMatch = line.match(/silence_end:\s*([\d.]+)/);

    if (startMatch) {
      currentStart = parseFloat(startMatch[1]);
    }

    if (endMatch && currentStart !== null) {
      silencePeriods.push({
        start: currentStart,
        end: parseFloat(endMatch[1])
      });
      currentStart = null;
    }
  }

  if (currentStart !== null) {
    silencePeriods.push({
      start: currentStart,
      end: Infinity
    });
  }

  return silencePeriods;
}

/**
 * Calculate trim points - only trim silence at beginning and end
 * @param {Object} silenceData - Output from detectSilence
 * @returns {Object} - { trimStart, trimEnd, hasTrimming }
 */
function calculateTrimPoints(silenceData) {
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

  log.info(`Trim points: ${trimStart.toFixed(2)}s to ${trimEnd.toFixed(2)}s (trimming: ${hasTrimming})`);

  return {
    trimStart,
    trimEnd,
    hasTrimming
  };
}

/**
 * Get video duration using ffprobe
 * @param {string} inputPath - Path to video
 * @returns {Promise<Object>} - { duration }
 */
async function getVideoDuration(inputPath) {
  return new Promise((resolve, reject) => {
    ffprobe(inputPath)
      .then((metadata) => {
        const duration = parseFloat(metadata.format.duration) || 0;
        resolve({ duration });
      })
      .catch(reject);
  });
}

module.exports = {
  detectSilence,
  calculateTrimPoints,
  parseSilenceOutput,
  SILENCE_THRESHOLD_DB,
  MIN_SILENCE_DURATION
};
