import { renderMedia, selectComposition } from '@remotion/renderer';

import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { getBundle } from './bundle.js';
import { loadAllFonts, getAllFontPaths, FONTS_DIR } from './fonts.js';
import { createLogger } from '../../utils/logger.js';
import redisClient from '../../utils/redisClient.js';

const log = createLogger('remotion-render');

const EXPORTS_DIR = path.resolve(__dirname, '../../uploads/exports');
const COMPOSITION_ID = 'VideoEditor';

const MAX_CONCURRENT_RENDERS = 2;
let currentRenders = 0;
const renderQueue = [];

async function ensureExportsDir() {
  try {
    await fs.mkdir(EXPORTS_DIR, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

function processQueue() {
  while (renderQueue.length > 0 && currentRenders < MAX_CONCURRENT_RENDERS) {
    const next = renderQueue.shift();
    if (next) {
      currentRenders++;
      next.execute().finally(() => {
        currentRenders--;
        processQueue();
      });
    }
  }
}

function queueRender(renderFn) {
  return new Promise((resolve, reject) => {
    const task = {
      execute: async () => {
        try {
          const result = await renderFn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      }
    };

    renderQueue.push(task);
    processQueue();
  });
}

async function renderVideo(options) {
  const {
    clips,
    segments,
    subtitles = '',
    stylePreference = 'shadow',
    textOverlays = [],
    videoWidth = 1920,
    videoHeight = 1080,
    fps = 30,
    exportToken,
    outputFilename
  } = options;

  return queueRender(async () => {
    const renderStartTime = Date.now();
    log.info(`[${exportToken}] Starting Remotion render: ${videoWidth}x${videoHeight} @ ${fps}fps`);

    try {
      await ensureExportsDir();

      const totalDuration = segments.reduce((acc, seg) => acc + (seg.end - seg.start), 0);
      const durationInFrames = Math.ceil(totalDuration * fps);

      log.debug(`[${exportToken}] Composition: ${durationInFrames} frames, ${totalDuration.toFixed(2)}s`);

      await updateProgress(exportToken, 5, 'Loading fonts...');

      try {
        await loadAllFonts();
        log.debug(`[${exportToken}] Fonts loaded`);
      } catch (fontError) {
        log.warn(`[${exportToken}] Font loading warning: ${fontError.message}`);
      }

      await updateProgress(exportToken, 10, 'Bundling composition...');

      const bundleLocation = await getBundle();
      log.debug(`[${exportToken}] Using bundle: ${bundleLocation}`);

      await updateProgress(exportToken, 15, 'Preparing composition...');

      const inputProps = {
        clips,
        segments,
        subtitles,
        stylePreference,
        textOverlays,
        videoWidth,
        videoHeight,
        fps,
        durationInFrames
      };

      const composition = await selectComposition({
        serveUrl: bundleLocation,
        id: COMPOSITION_ID,
        inputProps
      });

      log.info(`[${exportToken}] Composition: ${composition.width}x${composition.height}, target: ${videoWidth}x${videoHeight}`);

      const outputPath = path.join(
        EXPORTS_DIR,
        outputFilename || `remotion_${exportToken}_${Date.now()}.mp4`
      );

      await updateProgress(exportToken, 20, 'Rendering video...');

      let lastProgressUpdate = Date.now();
      const PROGRESS_THROTTLE_MS = 500;

      await renderMedia({
        composition,
        serveUrl: bundleLocation,
        codec: 'h264',
        outputLocation: outputPath,
        inputProps,
        concurrency: '75%', // Use more CPU for speed
        // Speed-optimized settings (still good quality)
        imageFormat: 'jpeg', // Much faster than PNG
        jpegQuality: 90, // High quality JPEG
        crf: 20, // Good quality, faster encoding
        pixelFormat: 'yuv420p',
        x264Preset: 'medium', // Balanced speed/quality
        colorSpace: 'bt709',
        audioBitrate: '256k',
        scale: 1, // Native resolution (faster)
        chromiumOptions: {
          enableMultiProcessOnLinux: true,
          gl: 'angle',
        },
        onProgress: async ({ progress }) => {
          const now = Date.now();
          if (now - lastProgressUpdate > PROGRESS_THROTTLE_MS) {
            const overallProgress = Math.round(20 + (progress * 75));
            await updateProgress(exportToken, overallProgress, 'Rendering...');
            lastProgressUpdate = now;
          }
        }
      });

      await updateProgress(exportToken, 95, 'Finalizing...');

      const stats = await fs.stat(outputPath);
      const renderDuration = Date.now() - renderStartTime;

      log.info(`[${exportToken}] Render complete: ${(stats.size / 1024 / 1024).toFixed(2)}MB in ${(renderDuration / 1000).toFixed(1)}s`);

      await updateProgress(exportToken, 100, 'Complete', {
        status: 'complete',
        outputPath,
        fileSize: stats.size
      });

      return {
        success: true,
        outputPath,
        fileSize: stats.size,
        renderTime: renderDuration
      };

    } catch (error) {
      log.error(`[${exportToken}] Render failed: ${error.message}`);

      await updateProgress(exportToken, 0, 'Error', {
        status: 'error',
        error: error.message
      });

      throw error;
    }
  });
}

async function updateProgress(exportToken, progress, message, additionalData = {}) {
  if (!exportToken) return;

  try {
    const data = {
      status: additionalData.status || 'exporting',
      progress,
      message,
      ...additionalData
    };

    await redisClient.set(`export:${exportToken}`, JSON.stringify(data), { EX: 3600 });
  } catch (error) {
    log.warn(`[${exportToken}] Progress update failed: ${error.message}`);
  }
}

async function cleanupRender(outputPath) {
  if (!outputPath) return;

  try {
    await fs.unlink(outputPath);
    log.debug(`Cleaned up render output: ${outputPath}`);
  } catch (error) {
    log.warn(`Failed to cleanup render output: ${error.message}`);
  }
}

function getRenderQueueStatus() {
  return {
    currentRenders,
    queueLength: renderQueue.length,
    maxConcurrent: MAX_CONCURRENT_RENDERS
  };
}

export { renderVideo, cleanupRender, getRenderQueueStatus, EXPORTS_DIR };