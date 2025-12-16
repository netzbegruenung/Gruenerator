import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../../../utils/logger.js';
import redisClient from '../../../utils/redisClient.js';
import * as hwaccel from './hwaccelUtils.js';

const require = createRequire(import.meta.url);
const { ffmpeg, ffprobe } = require('./ffmpegWrapper.js');
const { calculateScaleFilter, buildFFmpegOutputOptions, buildVideoFilters } = require('./ffmpegExportUtils.js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const log = createLogger('export-service');

const EXPORTS_DIR = path.join(__dirname, '../../../uploads/exports');

async function getVideoMetadata(inputPath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(inputPath, (err, metadata) => {
            if (err) {
                reject(err);
                return;
            }
            const videoStream = metadata.streams.find(s => s.codec_type === 'video');
            const audioStream = metadata.streams.find(s => s.codec_type === 'audio');

            resolve({
                width: videoStream?.width || 1920,
                height: videoStream?.height || 1080,
                duration: parseFloat(metadata.format.duration) || 0,
                rotation: videoStream?.rotation || '0',
                originalFormat: {
                    codec: videoStream?.codec_name,
                    audioCodec: audioStream?.codec_name,
                    audioBitrate: audioStream?.bit_rate ? parseInt(audioStream.bit_rate) / 1000 : null,
                    videoBitrate: videoStream?.bit_rate ? parseInt(videoStream.bit_rate) : null
                }
            });
        });
    });
}

function parseSubtitleSegments(subtitles) {
    return subtitles
        .split('\n\n')
        .map((block) => {
            const lines = block.trim().split('\n');
            if (lines.length < 2) return null;

            const timeLine = lines[0].trim();
            const timeMatch = timeLine.match(/^(\d{1,2}):(\d{2})\.(\d)\s*-\s*(\d{1,2}):(\d{2})\.(\d)$/);
            if (!timeMatch) return null;

            const startMin = parseInt(timeMatch[1]);
            const startSec = parseInt(timeMatch[2]);
            const startFrac = parseInt(timeMatch[3]);
            const endMin = parseInt(timeMatch[4]);
            const endSec = parseInt(timeMatch[5]);
            const endFrac = parseInt(timeMatch[6]);

            const startTime = startMin * 60 + startSec + startFrac * 0.1;
            const endTime = endMin * 60 + endSec + endFrac * 0.1;
            const text = lines.slice(1).join('\n');

            return { startTime, endTime, text };
        })
        .filter(Boolean)
        .sort((a, b) => a.startTime - b.startTime);
}

function calculateFontSize(metadata) {
    const isVertical = metadata.width < metadata.height;
    const referenceDimension = isVertical ? metadata.width : metadata.height;
    const totalPixels = metadata.width * metadata.height;

    let minFontSize, maxFontSize, basePercentage;

    if (referenceDimension >= 2160) {
        minFontSize = 80;
        maxFontSize = 180;
        basePercentage = isVertical ? 0.070 : 0.065;
    } else if (referenceDimension >= 1440) {
        minFontSize = 60;
        maxFontSize = 140;
        basePercentage = isVertical ? 0.065 : 0.060;
    } else if (referenceDimension >= 1080) {
        minFontSize = 40;
        maxFontSize = 90;
        basePercentage = isVertical ? 0.054 : 0.0495;
    } else if (referenceDimension >= 720) {
        minFontSize = 35;
        maxFontSize = 70;
        basePercentage = isVertical ? 0.055 : 0.050;
    } else {
        minFontSize = 32;
        maxFontSize = 65;
        basePercentage = isVertical ? 0.065 : 0.060;
    }

    const pixelFactor = Math.log10(totalPixels / 2073600) * 0.15 + 1;
    const adjustedPercentage = basePercentage * Math.min(pixelFactor, 1.4);

    return Math.max(minFontSize, Math.min(maxFontSize, Math.floor(referenceDimension * adjustedPercentage)));
}

export async function processProjectExport(project, projService) {
    const exportToken = uuidv4();

    log.info(`Starting project export for project ${project.id}, token: ${exportToken}`);

    try {
        const inputPath = projService.getVideoPath(project.video_path);

        try {
            await fs.access(inputPath);
        } catch {
            throw new Error('Video file not found');
        }

        const metadata = project.video_metadata || await getVideoMetadata(inputPath);
        const fileStats = await fs.stat(inputPath);

        const segments = parseSubtitleSegments(project.subtitles);
        if (segments.length === 0) {
            throw new Error('No valid subtitle segments found');
        }

        await fs.mkdir(EXPORTS_DIR, { recursive: true });
        const outputPath = path.join(EXPORTS_DIR, `subtitled_${project.id}_${Date.now()}.mp4`);

        const finalFontSize = calculateFontSize(metadata);

        const stylePreference = project.style_preference || 'standard';
        const heightPreference = project.height_preference || 'standard';
        const locale = 'de-DE';

        await redisClient.set(`export:${exportToken}`, JSON.stringify({
            status: 'exporting',
            progress: 0,
            message: 'Starting video processing...'
        }), { EX: 60 * 60 });

        const AssSubtitleService = (await import('./assSubtitleService.js')).default;
        const assService = new AssSubtitleService();

        const isVertical = metadata.width < metadata.height;
        const styleOptions = {
            fontSize: Math.floor(finalFontSize / 2),
            marginL: 10,
            marginR: 10,
            marginV: heightPreference === 'tief'
                ? Math.floor(metadata.height * 0.20)
                : Math.floor(metadata.height * 0.33),
            alignment: 2
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
        } catch (fontCopyError) {
            log.warn(`Font copy failed: ${fontCopyError.message}`);
        }

        const { ffmpegPool } = await import('./ffmpegPool.js');

        const useHwAccel = await hwaccel.detectVaapi();

        const { outputOptions, inputOptions } = buildFFmpegOutputOptions({
            metadata,
            fileStats,
            useHwAccel,
            includeTune: true
        });

        const videoFilters = buildVideoFilters({
            assFilePath,
            tempFontPath,
            scaleFilter: null,
            useHwAccel
        });

        await ffmpegPool.run(async () => {
            await new Promise((resolve, reject) => {
                const command = ffmpeg(inputPath)
                    .setDuration(parseFloat(metadata.duration) || 0);

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
                    .on('progress', async (progress) => {
                        const progressPercent = progress.percent ? Math.round(progress.percent) : 0;
                        try {
                            await redisClient.set(`export:${exportToken}`, JSON.stringify({
                                status: 'exporting',
                                progress: progressPercent,
                                message: `Processing: ${progressPercent}%`
                            }), { EX: 60 * 60 });
                        } catch {}
                    })
                    .on('error', (err) => {
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
        } catch {}

        await redisClient.set(`export:${exportToken}`, JSON.stringify({
            status: 'complete',
            progress: 100,
            outputPath,
            duration: metadata.duration
        }), { EX: 60 * 60 });

        log.info(`Project export completed: ${outputPath}`);

        return {
            exportToken,
            outputPath,
            duration: metadata.duration
        };

    } catch (error) {
        log.error(`Project export failed: ${error.message}`);

        await redisClient.set(`export:${exportToken}`, JSON.stringify({
            status: 'error',
            error: error.message
        }), { EX: 60 * 60 });

        throw error;
    }
}
