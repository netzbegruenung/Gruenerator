/**
 * Segment Filter Builders
 *
 * FFmpeg filter_complex builders for segment trimming and concatenation.
 */

import { createLogger } from '../../utils/logger.js';

const log = createLogger('segment-filter');

export interface Segment {
  start: number;
  end: number;
  clipId?: string;
}

export interface Clip {
  clipId: string;
  inputPath: string;
}

export interface FilterComplexResult {
  filterComplex: string;
  outputStreams: string[];
  clipInputMap?: Record<string, number>;
}

/**
 * Build FFmpeg filter_complex for single-clip segment trim and concat
 */
export function buildSegmentFilterComplex(segments: Segment[]): FilterComplexResult {
  const videoFilters: string[] = [];
  const audioFilters: string[] = [];

  segments.forEach((segment, index) => {
    const vLabel = `v${index}`;
    const aLabel = `a${index}`;

    videoFilters.push(
      `[0:v]trim=start=${segment.start}:end=${segment.end},setpts=PTS-STARTPTS[${vLabel}]`
    );

    audioFilters.push(
      `[0:a]atrim=start=${segment.start}:end=${segment.end},asetpts=PTS-STARTPTS[${aLabel}]`
    );
  });

  const concatInputs = segments.map((_, i) => `[v${i}][a${i}]`).join('');
  const concatFilter = `${concatInputs}concat=n=${segments.length}:v=1:a=1[outv][outa]`;

  const filterComplex = [
    ...videoFilters,
    ...audioFilters,
    concatFilter
  ].join(';');

  return {
    filterComplex,
    outputStreams: ['[outv]', '[outa]']
  };
}

/**
 * Build FFmpeg filter_complex for video-only segments (no audio)
 */
export function buildVideoOnlyFilterComplex(segments: Segment[]): FilterComplexResult {
  const videoFilters: string[] = [];

  segments.forEach((segment, index) => {
    const vLabel = `v${index}`;
    videoFilters.push(
      `[0:v]trim=start=${segment.start}:end=${segment.end},setpts=PTS-STARTPTS[${vLabel}]`
    );
  });

  const concatInputs = segments.map((_, i) => `[v${i}]`).join('');
  const concatFilter = `${concatInputs}concat=n=${segments.length}:v=1:a=0[outv]`;

  const filterComplex = [
    ...videoFilters,
    concatFilter
  ].join(';');

  return {
    filterComplex,
    outputStreams: ['[outv]']
  };
}

/**
 * Build FFmpeg filter_complex for multi-clip segment trim and concat
 */
export function buildMultiClipFilterComplex(clips: Clip[], segments: Segment[]): FilterComplexResult {
  const clipInputMap: Record<string, number> = {};
  clips.forEach((clip, index) => {
    clipInputMap[clip.clipId] = index;
  });

  const videoFilters: string[] = [];
  const audioFilters: string[] = [];

  segments.forEach((segment, index) => {
    const inputIdx = segment.clipId ? clipInputMap[segment.clipId] : undefined;
    if (inputIdx === undefined) {
      log.warn(`Segment ${index} references unknown clipId: ${segment.clipId}`);
      return;
    }

    const vLabel = `v${index}`;
    const aLabel = `a${index}`;

    videoFilters.push(
      `[${inputIdx}:v]trim=start=${segment.start}:end=${segment.end},setpts=PTS-STARTPTS[${vLabel}]`
    );

    audioFilters.push(
      `[${inputIdx}:a]atrim=start=${segment.start}:end=${segment.end},asetpts=PTS-STARTPTS[${aLabel}]`
    );
  });

  const concatInputs = segments.map((_, i) => `[v${i}][a${i}]`).join('');
  const concatFilter = `${concatInputs}concat=n=${segments.length}:v=1:a=1[outv][outa]`;

  const filterComplex = [
    ...videoFilters,
    ...audioFilters,
    concatFilter
  ].join(';');

  return {
    filterComplex,
    outputStreams: ['[outv]', '[outa]'],
    clipInputMap
  };
}

/**
 * Build FFmpeg filter_complex for multi-clip video-only (no audio)
 */
export function buildMultiClipVideoOnlyFilterComplex(clips: Clip[], segments: Segment[]): FilterComplexResult {
  const clipInputMap: Record<string, number> = {};
  clips.forEach((clip, index) => {
    clipInputMap[clip.clipId] = index;
  });

  const videoFilters: string[] = [];

  segments.forEach((segment, index) => {
    const inputIdx = segment.clipId ? clipInputMap[segment.clipId] : undefined;
    if (inputIdx === undefined) return;

    const vLabel = `v${index}`;
    videoFilters.push(
      `[${inputIdx}:v]trim=start=${segment.start}:end=${segment.end},setpts=PTS-STARTPTS[${vLabel}]`
    );
  });

  const concatInputs = segments.map((_, i) => `[v${i}]`).join('');
  const concatFilter = `${concatInputs}concat=n=${segments.length}:v=1:a=0[outv]`;

  const filterComplex = [
    ...videoFilters,
    concatFilter
  ].join(';');

  return {
    filterComplex,
    outputStreams: ['[outv]'],
    clipInputMap
  };
}

/**
 * Calculate total duration of all segments
 */
export function calculateTotalDuration(segments: Segment[]): number {
  return segments.reduce((total, seg) => total + (seg.end - seg.start), 0);
}

/**
 * Check if segments use multiple clips
 */
export function isMultiClipExport(segments: Segment[]): boolean {
  if (!segments || segments.length === 0) return false;
  const clipIds = new Set(segments.map(s => s.clipId).filter(Boolean));
  return clipIds.size > 1;
}

/**
 * Get unique clips from segments
 */
export function getUniqueClipsFromSegments<T extends { clipId?: string }>(
  segments: Segment[],
  clipRegistry: Record<string, T>
): (T & { clipId: string })[] {
  const clipIds = [...new Set(segments.map(s => s.clipId).filter(Boolean))] as string[];
  return clipIds.map(clipId => ({
    clipId,
    ...clipRegistry[clipId]
  })).filter(c => c.clipId) as (T & { clipId: string })[];
}
