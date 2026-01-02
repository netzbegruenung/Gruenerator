/**
 * Background Export Service
 *
 * Handles async video export processing with FFmpeg.
 */

import path from 'path';
import fs from 'fs';
import { ffmpeg } from './ffmpegWrapper.js';
import { ffmpegPool } from './ffmpegPool.js';
import AssSubtitleService from './assSubtitleService.js';
import { saveToExistingProject, autoSaveProject } from './projectSavingService.js';
import * as hwaccel from './hwaccelUtils.js';
import { calculateScaleFilter, buildFFmpegOutputOptions, buildVideoFilters } from './ffmpegExportUtils.js';
import { redisClient } from '../../utils/redis/index.js';
import { createLogger } from '../../utils/logger.js';

const fsPromises = fs.promises;
const log = createLogger('background-export');
const assService = new AssSubtitleService();

export interface BackgroundExportParams {
  inputPath: string;
  outputPath: string;
  segments: Array<{ text: string; start: number; end: number }>;
  metadata: { width: number; height: number; duration: string | number };
  fileStats: { size: number };
  exportToken: string;
  subtitlePreference: string;
  stylePreference: string;
  heightPreference: string;
  locale?: string;
  maxResolution?: number | null;
  finalFontSize: number;
  uploadId: string;
  originalFilename: string;
  assFilePath?: string | null;
  tempFontPath?: string | null;
  projectId?: string | null;
  userId?: string | null;
  textOverlays?: Array<any>;
}

export async function setRedisStatus(
  key: string,
  status: string,
  data: Record<string, any> | null = null,
  ttlSeconds: number = 86400
): Promise<void> {
  const payload = data !== null ? { status, ...data } : { status };
  await redisClient.set(key, JSON.stringify(payload), { EX: ttlSeconds });
  log.debug(`Redis status '${status}' set for ${key}`);
}

async function cleanupExportArtifacts(assFilePath: string | null, tempFontPath: string | null): Promise<void> {
  if (assFilePath) {
    await assService.cleanupTempFile(assFilePath).catch((err: Error) => log.warn(`ASS cleanup failed: ${err.message}`));
    if (tempFontPath) {
      await fsPromises.unlink(tempFontPath).catch((err: Error) => log.warn(`Font cleanup failed: ${err.message}`));
    }
  }
}

export async function processVideoExportInBackground(params: BackgroundExportParams): Promise<void> {
  const {
    inputPath,
    outputPath,
    segments,
    metadata,
    fileStats,
    exportToken,
    subtitlePreference,
    stylePreference,
    heightPreference,
    locale = 'de-DE',
    maxResolution = null,
    finalFontSize,
    uploadId,
    originalFilename,
    assFilePath: preGeneratedAssPath = null,
    tempFontPath: preGeneratedFontPath = null,
    projectId: initialProjectId = null,
    userId = null,
    textOverlays = []
  } = params;

  let projectId = initialProjectId;

  try {
    log.debug(`Background export starting for token: ${exportToken}`);

    let assFilePath = preGeneratedAssPath;
    let tempFontPath = preGeneratedFontPath;

    if (!assFilePath) {
      log.debug('No pre-generated ASS file, generating in background');
      const cacheKey = `${uploadId}_${subtitlePreference}_${stylePreference}_${heightPreference}_${locale}_${metadata.width}x${metadata.height}`;

      try {
        let assContent = await assService.getCachedAssContent(cacheKey);

        if (!assContent) {
          const styleOptions = {
            fontSize: Math.floor(finalFontSize / 2),
            marginL: 10,
            marginR: 10,
            marginV: subtitlePreference === 'word'
              ? Math.floor(metadata.height * 0.50)
              : (heightPreference === 'tief'
                ? Math.floor(metadata.height * 0.20)
                : Math.floor(metadata.height * 0.33)),
            alignment: subtitlePreference === 'word' ? 5 : 2
          };

          const assSegments = segments.map(s => ({ text: s.text, startTime: s.start, endTime: s.end }));
          const assMetadata = { width: metadata.width, height: metadata.height, duration: typeof metadata.duration === 'string' ? parseFloat(metadata.duration) : metadata.duration };
          const assResult = assService.generateAssContent(
            assSegments,
            assMetadata,
            styleOptions,
            subtitlePreference,
            stylePreference,
            locale,
            heightPreference,
            textOverlays
          );
          assContent = assResult.content;

          await assService.cacheAssContent(cacheKey, assContent);
        }

        assFilePath = await assService.createTempAssFile(assContent, uploadId);

        const effectiveStyle = assService.mapStyleForLocale(stylePreference, locale);
        const sourceFontPath = assService.getFontPathForStyle(effectiveStyle);
        const fontFilename = path.basename(sourceFontPath);
        tempFontPath = path.join(path.dirname(assFilePath), fontFilename);

        try {
          await fsPromises.copyFile(sourceFontPath, tempFontPath);
        } catch (fontCopyError: any) {
          log.warn(`Font copy failed: ${fontCopyError.message}`);
          tempFontPath = null;
        }

      } catch (assError: any) {
        log.error(`ASS generation error: ${assError.message}`);
        assFilePath = null;
      }
    } else {
      log.debug('Using pre-generated ASS file from export endpoint');
    }

    const useHwAccel = await hwaccel.detectVaapi();
    const scaleFilter = calculateScaleFilter(metadata, maxResolution);

    const { outputOptions, inputOptions } = buildFFmpegOutputOptions({
      metadata,
      fileStats,
      useHwAccel,
      includeTune: true
    });

    const videoFilters = buildVideoFilters({
      assFilePath,
      tempFontPath,
      scaleFilter,
      useHwAccel
    });

    await ffmpegPool.run(async () => {
      await new Promise<void>((resolve, reject) => {
        const command = ffmpeg(inputPath)
          .setDuration(parseFloat(String(metadata.duration)) || 0);

        if (inputOptions.length > 0) {
          command.inputOptions(inputOptions);
        }

        command.outputOptions(outputOptions);

        if (videoFilters.length > 0) {
          command.videoFilters(videoFilters);
        }

        command
          .on('start', () => {
            log.debug('FFmpeg processing started');
          })
          .on('progress', async (progress: { percent?: number; timemark?: string }) => {
            const progressPercent = progress.percent ? Math.round(progress.percent) : 0;

            try {
              await redisClient.set(`export:${exportToken}`, JSON.stringify({
                status: 'exporting',
                progress: progressPercent,
                timeRemaining: progress.timemark
              }), { EX: 60 * 60 });
            } catch (redisError: any) {
              log.warn(`Redis progress update error: ${redisError.message}`);
            }
          })
          .on('error', async (err: Error) => {
            log.error(`FFmpeg error: ${err.message}`);
            redisClient.set(`export:${exportToken}`, JSON.stringify({
              status: 'error',
              error: err.message || 'FFmpeg processing failed'
            }), { EX: 60 * 60 }).catch((redisErr: Error) => log.warn(`Redis error storage failed: ${redisErr.message}`));

            await cleanupExportArtifacts(assFilePath, tempFontPath);
            reject(err);
          })
          .on('end', async () => {
            log.info(`FFmpeg processing complete for ${exportToken}`);

            if (projectId && userId) {
              try {
                await saveToExistingProject(userId, projectId, outputPath);
              } catch (saveError: any) {
                log.warn(`Failed to save to project: ${saveError.message}`);
              }
            }

            if (!projectId && userId && uploadId) {
              try {
                const result = await autoSaveProject({
                  userId,
                  outputPath,
                  originalVideoPath: inputPath,
                  uploadId,
                  originalFilename,
                  segments: segments.map(s => ({ text: s.text, start: s.start, end: s.end })),
                  metadata: { width: metadata.width, height: metadata.height, duration: metadata.duration },
                  fileStats,
                  stylePreference,
                  heightPreference,
                  subtitlePreference,
                  exportToken
                });
                projectId = result.projectId;
              } catch (autoSaveError: any) {
                log.warn(`Auto-save failed: ${autoSaveError.message}`);
              }
            }

            try {
              await setRedisStatus(`export:${exportToken}`, 'complete', {
                progress: 100,
                outputPath: outputPath,
                originalFilename: originalFilename,
                projectId: projectId || null
              }, 3600);
            } catch (redisError: any) {
              log.warn(`Redis completion status storage failed: ${redisError.message}`);
            }

            await cleanupExportArtifacts(assFilePath, tempFontPath);
            resolve();
          });

        command.save(outputPath);
      });
    }, `export-${exportToken}`);

  } catch (error: any) {
    log.error(`Background processing failed for ${exportToken}: ${error.message}`);

    try {
      await redisClient.set(`export:${exportToken}`, JSON.stringify({
        status: 'error',
        error: error.message || 'Background processing failed'
      }), { EX: 60 * 60 });
    } catch (redisError: any) {
      log.warn(`Redis error storage failed: ${redisError.message}`);
    }
  }
}
