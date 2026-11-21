/**
 * Hand-off of a subtitler project to the video editor („Bearbeiten“).
 *
 * The editor opens `?untertitel=<projectId>`, calls POST
 * /api/subtitler/projects/:id/editor-seed once its project is empty, and builds
 * a video clip plus a caption track from the answer. It splits the words into
 * captions itself, with the function its own caption button uses, so a handed
 * over project looks exactly like one captioned in the editor.
 */
import path from 'path';

import {
  type SubtitleSegment,
  type SubtitleWord,
  type SubtitlerEditorSeed,
  type VideoAiCaptionTemplate,
  type VideoAspectRatio,
} from '@gruenerator/contracts';

import { getSharedMediaService } from '../sharedMediaService.js';

import { type SubtitlerProjectService } from './ProjectService.js';

/** Subtitler look → the nearest editor caption template. */
const TEMPLATE_FOR_STYLE: Record<string, VideoAiCaptionTemplate> = {
  shadow: 'schatten',
  clean: 'klar',
  tanne: 'tanne',
  standard: 'balken-schwarz',
};

export function captionTemplateFor(stylePreference: string | null): VideoAiCaptionTemplate {
  return TEMPLATE_FOR_STYLE[stylePreference ?? ''] ?? 'schatten';
}

const RATIOS: [VideoAspectRatio, number][] = [
  ['9:16', 9 / 16],
  ['4:5', 4 / 5],
  ['1:1', 1],
  ['16:9', 16 / 9],
];

/** Displayed size; `probeVideoMetadata` already swapped width and height for rotated video. */
export function displaySize(
  meta: Record<string, unknown>
): { width: number; height: number } | null {
  const width = typeof meta.width === 'number' ? meta.width : null;
  const height = typeof meta.height === 'number' ? meta.height : null;
  return width && height ? { width, height } : null;
}

/** Where each joined part starts, from `video_metadata.parts`; `[0]` for one video. */
export function clipStartsFor(meta: Record<string, unknown>): number[] {
  const parts = Array.isArray(meta.parts)
    ? meta.parts.filter((d): d is number => typeof d === 'number' && d > 0)
    : [];
  const starts = [0];
  for (const d of parts.slice(0, -1)) starts.push(starts[starts.length - 1] + d);
  return starts;
}

/** The editor canvas closest to the video's shape; 9:16 when the size is unknown. */
export function aspectRatioFor(size: { width: number; height: number } | null): VideoAspectRatio {
  if (!size) return '9:16';
  const ratio = size.width / size.height;
  let best = RATIOS[0];
  for (const candidate of RATIOS) {
    if (Math.abs(Math.log(candidate[1] / ratio)) < Math.abs(Math.log(best[1] / ratio))) {
      best = candidate;
    }
  }
  return best[0];
}

const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim();

/**
 * The words the editor should caption. The stored provider words, as long as
 * they still say what the segments say; once someone edited the text in the
 * subtitler (or the project predates stored words), each segment's words are
 * spread evenly over its span, like the editor's own SRT import does.
 */
export function wordsForEditor(
  stored: SubtitleWord[] | null,
  segments: SubtitleSegment[]
): SubtitleWord[] {
  if (stored && stored.length > 0) {
    const fromWords = normalize(stored.map((w) => w.word).join(''));
    const fromSegments = normalize(segments.map((s) => s.text).join(''));
    if (fromWords === fromSegments) return stored;
  }
  const words: SubtitleWord[] = [];
  for (const segment of segments) {
    const parts = segment.text.split(/\s+/).filter(Boolean);
    if (parts.length === 0) continue;
    const step = (segment.endTime - segment.startTime) / parts.length;
    parts.forEach((word, i) => {
      words.push({
        word,
        start: segment.startTime + i * step,
        end: segment.startTime + (i + 1) * step,
      });
    });
  }
  return words;
}

function parseSegments(stored: string): SubtitleSegment[] {
  if (!stored.trimStart().startsWith('[')) return [];
  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (s): s is SubtitleSegment =>
      typeof s === 'object' &&
      s !== null &&
      typeof (s as SubtitleSegment).text === 'string' &&
      typeof (s as SubtitleSegment).startTime === 'number' &&
      typeof (s as SubtitleSegment).endTime === 'number'
  );
}

export type EditorSeedResult =
  { status: 'ok'; seed: SubtitlerEditorSeed } | { status: 'not_found' } | { status: 'source_gone' };

export async function buildEditorSeed(
  service: SubtitlerProjectService,
  userId: string,
  projectId: string
): Promise<EditorSeedResult> {
  const project = await service.getProjectById(projectId);
  if (!project || project.user_id !== userId) return { status: 'not_found' };

  const source = await service.getVideoSource(userId, projectId);
  if (!source) return { status: 'not_found' };
  if (!source.path) return { status: 'source_gone' };

  const meta = project.video_metadata ?? {};
  const size = displaySize(meta);
  const duration = Number(meta.duration ?? 0) || 0;
  const title = project.title || 'Untertiteltes Video';

  // One Mediathek copy of the original per project: the editor project keeps
  // playing it after the subtitler project is trashed (the 20-project cap).
  const shares = getSharedMediaService();
  const fileName = path.basename(source.path);
  const shareToken =
    (await shares.findProjectVideoShare(userId, projectId, fileName)) ??
    (await shares.createVideoShare(userId, { videoPath: source.path, title, duration, projectId }))
      .shareToken;

  return {
    status: 'ok',
    seed: {
      title,
      video: {
        shareToken,
        duration,
        width: size?.width ?? null,
        height: size?.height ?? null,
        clipStarts: clipStartsFor(meta),
      },
      aspectRatio: aspectRatioFor(size),
      captionTemplate: captionTemplateFor(project.style_preference),
      words: wordsForEditor(project.words ?? null, parseSegments(project.subtitles ?? '')),
    },
  };
}
