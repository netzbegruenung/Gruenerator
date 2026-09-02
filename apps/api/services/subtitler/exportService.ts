/**
 * Export Service
 *
 * Processes project exports with FFmpeg and ASS subtitles.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { type SubtitleSegment } from '@gruenerator/contracts';
import { toJobErrorStatus } from '@gruenerator/contracts';
import { v4 as uuidv4 } from 'uuid';

import { type VideoMetadata } from '../../routes/subtitler/types.js';
import { toJobError } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';
import { redisClient } from '../../utils/redis/index.js';
import { getUserLocale, LOCALE_UNSET } from '../localization/localeCache.js';

import { buildFFmpegOutputOptions, buildVideoFilters } from './ffmpegExportUtils.js';
import { ffmpeg } from './ffmpegWrapper.js';
import { calculateFontSizing } from './subtitleSizingService.js';
import { probeVideoMetadata } from './videoMetadata.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const log = createLogger('export-service');

const EXPORTS_DIR = path.join(__dirname, '../../uploads/exports');

interface Project {
  id: string;
  video_path: string;
  video_metadata?: VideoMetadata;
  subtitles: string;
  style_preference?: string;
  height_preference?: string;
}

interface ProjectService {
  getVideoPath(relativePath: string): string;
}

interface ExportResult {
  exportToken: string;
  outputPath: string;
  duration: number;
}

function parseSubtitleSegments(subtitles: string): SubtitleSegment[] {
  return subtitles
    .split('\n\n')
    .map((block) => {
      const lines = block.trim().split('\n');
      if (lines.length < 2) return null;

      const timeLine = lines[0].trim();
      // Tolerant of 1–2 fractional digits (tenths/centiseconds); extra
      // digits are truncated. Emitters write 1 digit until Phase B.
      const timeMatch = timeLine.match(
        /^(\d{1,2}):(\d{2})\.(\d{1,2})\d*\s*-\s*(\d{1,2}):(\d{2})\.(\d{1,2})\d*$/
      );
      if (!timeMatch) return null;

      const startMin = parseInt(timeMatch[1]);
      const startSec = parseInt(timeMatch[2]);
      const startFrac = parseInt(timeMatch[3]) / 10 ** timeMatch[3].length;
      const endMin = parseInt(timeMatch[4]);
      const endSec = parseInt(timeMatch[5]);
      const endFrac = parseInt(timeMatch[6]) / 10 ** timeMatch[6].length;

      const startTime = startMin * 60 + startSec + startFrac;
      const endTime = endMin * 60 + endSec + endFrac;
      const text = lines.slice(1).join('\n');

      return { startTime, endTime, text };
    })
    .filter((segment): segment is SubtitleSegment => segment !== null)
    .sort((a, b) => a.startTime - b.startTime);
}

async function processProjectExport(
  project: Project,
  projService: ProjectService,
  ownerUserId?: string | null
): Promise<ExportResult> {
  const exportToken = uuidv4();

  log.info(`Starting project export for project ${project.id}, token: ${exportToken}`);

  try {
    const inputPath = projService.getVideoPath(project.video_path);

    try {
      await fs.access(inputPath);
    } catch {
      throw new Error('Video file not found');
    }

    const metadata = project.video_metadata || (await probeVideoMetadata(inputPath));
    const fileStats = await fs.stat(inputPath);

    const segments = parseSubtitleSegments(project.subtitles);
    if (segments.length === 0) {
      throw new Error('No valid subtitle segments found');
    }

    await fs.mkdir(EXPORTS_DIR, { recursive: true });
    const outputPath = path.join(EXPORTS_DIR, `subtitled_${project.id}_${Date.now()}.mp4`);

    const { finalFontSize } = calculateFontSizing(metadata, segments);

    const stylePreference = project.style_preference || 'standard';
    const heightPreference = project.height_preference || 'standard';
    // Re-exports used to hardcode de-DE, so an Austrian project re-rendered for
    // a share link came back with German styling and fonts — even though the
    // original export had been correct.
    // Blatt-Konsument: hier rendert ein Hintergrund-Job Schrift und Marke, es ist
    // niemand da, den man fragen könnte. Ohne bekanntes Land bleibt es beim
    // neutralen deutschen Satz — 'unset' darf dabei nicht als Locale durchlaufen.
    const lookup = ownerUserId ? await getUserLocale(ownerUserId) : null;
    const locale = lookup != null && lookup !== LOCALE_UNSET ? lookup : 'de-DE';

    await redisClient.set(
      `export:${exportToken}`,
      JSON.stringify({
        status: 'exporting',
        progress: 0,
        message: 'Starting video processing...',
      }),
      { EX: 60 * 60 }
    );

    const AssSubtitleService = (await import('./assSubtitleService.js')).default;
    const assService = new AssSubtitleService();

    const styleOptions = {
      fontSize: Math.floor(finalFontSize / 2),
      marginL: 10,
      marginR: 10,
      marginV:
        heightPreference === 'tief'
          ? Math.floor(metadata.height * 0.2)
          : Math.floor(metadata.height * 0.33),
      alignment: 2,
    };

    const assResult = assService.generateAssContent(
      segments,
      metadata,
      styleOptions,
      'manual',
      stylePreference,
      locale
    );

    const assFilePath = await assService.createTempAssFile(assResult.content, project.id);

    const effectiveStyle = assService.mapStyleForLocale(stylePreference, locale);
    const sourceFontPath = assService.getFontPathForStyle(effectiveStyle);
    const fontFilename = path.basename(sourceFontPath);
    const tempFontPath = path.join(path.dirname(assFilePath), fontFilename);

    try {
      await fs.copyFile(sourceFontPath, tempFontPath);
    } catch (fontCopyError: unknown) {
      log.warn(
        `Font copy failed: ${fontCopyError instanceof Error ? fontCopyError.message : String(fontCopyError)}`
      );
    }

    const { ffmpegPool } = await import('./ffmpegPool.js');

    const originalFormatObj = metadata.originalFormat
      ? {
          ...(metadata.originalFormat.codec ? { codec: metadata.originalFormat.codec } : {}),
          ...(metadata.originalFormat.videoBitrate != null
            ? {
                videoBitrate: metadata.originalFormat.videoBitrate,
              }
            : {}),
          ...(metadata.originalFormat.audioCodec
            ? { audioCodec: metadata.originalFormat.audioCodec }
            : {}),
          ...(metadata.originalFormat.audioBitrate != null
            ? {
                audioBitrate: metadata.originalFormat.audioBitrate,
              }
            : {}),
        }
      : undefined;

    const metadataObj: {
      width: number;
      height: number;
      rotation: string;
      originalFormat?: {
        codec?: string;
        videoBitrate?: number;
        audioCodec?: string;
        audioBitrate?: number | null;
      };
    } = {
      width: metadata.width,
      height: metadata.height,
      rotation: metadata.rotation ?? '0',
      ...(originalFormatObj ? { originalFormat: originalFormatObj } : {}),
    };

    const { outputOptions, inputOptions } = buildFFmpegOutputOptions({
      metadata: metadataObj,
      fileStats,
      includeTune: true,
    });

    const videoFilters = buildVideoFilters({
      assFilePath,
      tempFontPath,
      scaleFilter: null,
    });

    await ffmpegPool.run(async () => {
      await new Promise<void>((resolve, reject) => {
        const command = ffmpeg(inputPath).setDuration(parseFloat(String(metadata.duration)) || 0);

        if (inputOptions.length > 0) {
          command.inputOptions(inputOptions);
        }

        command.outputOptions(outputOptions);

        if (videoFilters.length > 0) {
          command.videoFilters(videoFilters);
        }

        command
          .on('start', () => {
            log.debug('FFmpeg export started');
          })
          .on('progress', async (progress: { percent?: number }) => {
            const progressPercent = progress.percent ? Math.round(progress.percent) : 0;
            try {
              await redisClient.set(
                `export:${exportToken}`,
                JSON.stringify({
                  status: 'exporting',
                  progress: progressPercent,
                  message: `Processing: ${progressPercent}%`,
                }),
                { EX: 60 * 60 }
              );
            } catch {
              /* ignore progress update error */
            }
          })
          .on('error', (err: Error) => {
            log.error(`FFmpeg error: ${err.message}`);
            reject(err);
          })
          .on('end', () => {
            log.info('FFmpeg export completed');
            resolve();
          })
          .save(outputPath);
      });
    });

    try {
      if (assFilePath) await fs.unlink(assFilePath).catch(() => {});
      if (tempFontPath) await fs.unlink(tempFontPath).catch(() => {});
    } catch {
      /* ignore temp file cleanup error */
    }

    await redisClient.set(
      `export:${exportToken}`,
      JSON.stringify({
        status: 'complete',
        progress: 100,
        outputPath,
        duration: metadata.duration,
      }),
      { EX: 60 * 60 }
    );

    log.info(`Project export completed: ${outputPath}`);

    return {
      exportToken,
      outputPath,
      duration: (metadata.duration as number | undefined) ?? 0,
    };
  } catch (error: unknown) {
    const jobError = toJobError(error, {
      scope: 'subtitler-export',
      meta: { exportToken },
    });

    await redisClient.set(`export:${exportToken}`, JSON.stringify(toJobErrorStatus(jobError)), {
      EX: 60 * 60,
    });

    throw error;
  }
}

export { processProjectExport, parseSubtitleSegments };
export type { VideoMetadata, SubtitleSegment, Project, ProjectService, ExportResult };
