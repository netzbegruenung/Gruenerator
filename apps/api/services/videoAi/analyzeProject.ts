/**
 * Step one of a KI-Schnitt job: from Mediathek items to everything the two
 * Gemma stages read. Per clip: working copy, transcript (footage only),
 * detectors, contact sheets read by Gemma. Per asset: a one-line description
 * or the length.
 *
 * Each finished clip is handed to `saveClip` before the next one starts, so a
 * retry after a crash continues where it stopped instead of paying for the
 * transcription twice.
 */
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { type VideoAiBrief } from '@gruenerator/contracts';
import sharp from 'sharp';

import { createLogger } from '../../utils/logger.js';
import { getSharedMediaService } from '../sharedMediaService.js';
import { probeVideoMetadata } from '../subtitler/videoMetadata.js';
import { GREENPT_STT_MODEL, listenWithGreenpt } from '../transcription/greenptListen.js';
import { recordOperation } from '../usage/UsageTrackingService.js';

import { buildContactSheets, sampleTimes } from './contactSheet.js';
import { describeAsset, describeFrames } from './describeFrames.js';
import { analyzeClip } from './ffmpegAnalysis.js';
import {
  type StoredAssetAnalysis,
  type StoredClipAnalysis,
  type StoredVideoAiInput,
} from './projectTypes.js';
import { speechAudio, transcodeProxy } from './proxy.js';
import { type TranscriptWord } from './transcriptUnits.js';

const log = createLogger('videoAiAnalysis');

/** A failure no retry can fix; its message is written for the person. */
export class VideoAiFinalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VideoAiFinalError';
  }
}

/** A Mediathek item vanished between create and run. */
export class MaterialGoneError extends VideoAiFinalError {
  constructor(title: string) {
    super(`„${title}“ ist nicht mehr in der Mediathek. Leg den KI-Schnitt neu an.`);
    this.name = 'MaterialGoneError';
  }
}

export interface AnalyzeJob {
  userId: string;
  title: string;
  brief: VideoAiBrief;
  inputs: readonly StoredVideoAiInput[];
}

async function sourcePath(userId: string, input: StoredVideoAiInput): Promise<string> {
  const service = getSharedMediaService();
  const row = await service.getMediaById(userId, input.mediaId);
  const file = row ? service.getMediaFilePath(row.file_path) : null;
  if (!file) throw new MaterialGoneError(input.title);
  return file;
}

async function probeSeconds(file: string): Promise<number> {
  const duration = Number((await probeVideoMetadata(file)).duration);
  return Number.isFinite(duration) && duration > 0 ? duration : 0;
}

async function transcribe(
  proxyPath: string,
  keyterms: readonly string[]
): Promise<TranscriptWord[]> {
  let audio: Buffer;
  try {
    audio = await speechAudio(proxyPath);
  } catch (error) {
    // A clip without a sound track: no words, and the warning says so.
    log.warn(`No speech audio: ${(error as Error).message}`);
    return [];
  }
  const result = await listenWithGreenpt(audio, 'clip.mp3', { keyterms });
  recordOperation({ unit: 'transcriptions', provider: 'greenpt', model: GREENPT_STT_MODEL });
  return result.words.map(({ word, start, end }) => ({ word, start, end }));
}

export async function analyzeOneClip(
  job: AnalyzeJob,
  input: StoredVideoAiInput & { role: 'footage' | 'broll' },
  clipNumber: number
): Promise<StoredClipAnalysis> {
  const source = await sourcePath(job.userId, input);
  const tmp = path.join(os.tmpdir(), `video-ai-${randomUUID()}.mp4`);
  try {
    await transcodeProxy(source, tmp);
    const duration = await probeSeconds(tmp);
    const proxy = await getSharedMediaService().createVideoAiProxyShare(job.userId, {
      videoPath: tmp,
      title: `KI-Schnitt: ${job.title} – Clip ${clipNumber}`,
      durationSeconds: duration,
    });
    try {
      const proxyPath = getSharedMediaService().getMediaFilePath(`${proxy.shareToken}/media.mp4`);
      if (!proxyPath) throw new Error('proxy path not resolvable');

      const keyterms = [
        ...(job.brief.keyterms ?? []),
        ...(job.brief.person ? [job.brief.person.name] : []),
      ];
      const words = input.role === 'footage' ? await transcribe(proxyPath, keyterms) : [];
      const detectors = await analyzeClip(proxyPath, duration);
      const sheets = await buildContactSheets(
        proxyPath,
        sampleTimes(duration, detectors.sceneCuts)
      );
      const cells = await describeFrames(sheets);
      return {
        clipId: input.id,
        role: input.role,
        proxyMediaId: proxy.id,
        proxyShareToken: proxy.shareToken,
        duration,
        words,
        detectors,
        cells,
      };
    } catch (error) {
      // The retry makes a new working copy; this one would be referenced by nothing.
      await getSharedMediaService()
        .purgeInternalShare(proxy.shareToken, job.userId, ['video-ai-proxy'])
        .catch(() => false);
      throw error;
    }
  } finally {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
  }
}

const ASSET_EDGE = 1024;

export async function analyzeAssets(
  job: AnalyzeJob,
  inputs: readonly StoredVideoAiInput[]
): Promise<StoredAssetAnalysis[]> {
  const out: StoredAssetAnalysis[] = [];
  for (const input of inputs) {
    if (input.role !== 'image' && input.role !== 'logo' && input.role !== 'audio') continue;
    const file = await sourcePath(job.userId, input);
    if (input.role === 'audio') {
      out.push({
        id: input.id,
        kind: 'audio',
        description: null,
        durationSeconds: await probeSeconds(file),
      });
      continue;
    }
    let description: string | null = null;
    try {
      const jpeg = await sharp(file, { failOn: 'none' })
        .rotate()
        .resize(ASSET_EDGE, ASSET_EDGE, { fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 80 })
        .toBuffer();
      description = await describeAsset(jpeg, input.role === 'logo');
    } catch (error) {
      // The design stage still sees the file name; a missing line is no reason to stop.
      log.warn(`Asset ${input.id} not described: ${(error as Error).message}`);
    }
    out.push({ id: input.id, kind: input.role, description, durationSeconds: null });
  }
  return out;
}
