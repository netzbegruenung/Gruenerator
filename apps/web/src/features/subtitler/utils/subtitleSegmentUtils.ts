/**
 * Subtitle segment parsing and formatting utilities
 *
 * Consolidates duplicate subtitle block operations from:
 * - SubtitleEditor.tsx (lines 342-376 parsing, 545-557 and 606-618 IDENTICAL formatting)
 * - videoEditor/Timeline.tsx (lines 81-103 parsing)
 *
 * Critical: Lines 545-557 and 606-618 in SubtitleEditor are 100% identical!
 */

import type { SubtitleSegment } from '../types';
import { parseTimeRange, formatTimeRange, isValidTime } from './subtitleTimeUtils';

/**
 * Parse subtitle string blocks into array of segments
 *
 * Handles the standard format:
 * ```
 * 0:00.0 - 0:03.5
 * First subtitle text
 *
 * 0:03.5 - 0:07.2
 * Second subtitle text
 * ```
 *
 * @param subtitles - Full subtitle string with blocks separated by double newlines
 * @returns Array of parsed subtitle segments
 */
export function parseSubtitleBlocks(subtitles: string): SubtitleSegment[] {
  if (!subtitles || subtitles.trim() === '') {
    return [];
  }

  const blocks = subtitles.split('\n\n').filter(block => block.trim());

  const segments: SubtitleSegment[] = [];

  blocks.forEach((block, index) => {
    const lines = block.split('\n');
    if (lines.length < 2) {
      console.warn('[subtitleSegmentUtils] Invalid block format at index', index, ':', block);
      return;
    }

    const timeLine = lines[0];
    const textLines = lines.slice(1);
    const text = textLines.join('\n').trim();

    const timeRange = parseTimeRange(timeLine);
    if (!timeRange) {
      console.warn('[subtitleSegmentUtils] Invalid time range at index', index, ':', timeLine);
      return;
    }

    if (!isValidTime(timeRange.start) || !isValidTime(timeRange.end)) {
      console.warn('[subtitleSegmentUtils] Time out of bounds at index', index);
      return;
    }

    segments.push({
      id: index,
      startTime: timeRange.start,
      endTime: timeRange.end,
      text
    });
  });

  return segments;
}

/**
 * Format subtitle segments back to subtitle string
 *
 * This is the CRITICAL function that eliminates duplicate code at:
 * - SubtitleEditor.tsx lines 545-557 (handleExport)
 * - SubtitleEditor.tsx lines 606-618 (handleSaveProject)
 * Both were IDENTICAL implementations!
 *
 * @param segments - Array of subtitle segments
 * @returns Formatted subtitle string with double-newline separators
 */
export function formatSubtitleBlocks(segments: SubtitleSegment[]): string {
  return segments
    .map(segment => {
      const timeRangeStr = formatTimeRange(segment.startTime, segment.endTime);
      return `${timeRangeStr}\n${segment.text}`;
    })
    .join('\n\n');
}

/**
 * Find the active segment at a given time
 *
 * @param segments - Array of subtitle segments
 * @param currentTime - Current time in seconds
 * @returns The active segment or null if none found
 */
export function findActiveSegment(
  segments: SubtitleSegment[],
  currentTime: number
): SubtitleSegment | null {
  if (!segments || segments.length === 0) {
    return null;
  }

  return segments.find(segment =>
    currentTime >= segment.startTime && currentTime <= segment.endTime
  ) ?? null;
}

/**
 * Validate segment timing constraints
 *
 * Checks:
 * - Times are valid (not NaN, in bounds)
 * - End time is after start time
 * - Duration is reasonable (not too short/long)
 *
 * @param segment - Subtitle segment to validate
 * @returns true if valid, false otherwise
 */
export function isValidSegment(segment: SubtitleSegment): boolean {
  if (!isValidTime(segment.startTime) || !isValidTime(segment.endTime)) {
    return false;
  }

  if (segment.endTime <= segment.startTime) {
    return false;
  }

  const duration = segment.endTime - segment.startTime;

  // Duration should be between 0.1 seconds and 10 minutes
  if (duration < 0.1 || duration > 600) {
    return false;
  }

  // Text should not be empty
  if (!segment.text || segment.text.trim() === '') {
    return false;
  }

  return true;
}

/**
 * Validate an array of segments for overlaps and gaps
 *
 * @param segments - Array of subtitle segments (should be sorted by startTime)
 * @returns Object with validation results
 */
export function validateSegmentSequence(segments: SubtitleSegment[]): {
  valid: boolean;
  overlaps: Array<{ index1: number; index2: number }>;
  gaps: Array<{ afterIndex: number; gapDuration: number }>;
} {
  const overlaps: Array<{ index1: number; index2: number }> = [];
  const gaps: Array<{ afterIndex: number; gapDuration: number }> = [];

  for (let i = 0; i < segments.length - 1; i++) {
    const current = segments[i];
    const next = segments[i + 1];

    // Check for overlap
    if (current.endTime > next.startTime) {
      overlaps.push({ index1: i, index2: i + 1 });
    }

    // Check for significant gap (> 0.5 seconds)
    const gap = next.startTime - current.endTime;
    if (gap > 0.5) {
      gaps.push({ afterIndex: i, gapDuration: gap });
    }
  }

  return {
    valid: overlaps.length === 0,
    overlaps,
    gaps
  };
}

/**
 * Sort segments by start time
 *
 * @param segments - Array of subtitle segments
 * @returns New sorted array (does not mutate original)
 */
export function sortSegmentsByTime(segments: SubtitleSegment[]): SubtitleSegment[] {
  return [...segments].sort((a, b) => a.startTime - b.startTime);
}

/**
 * Re-index segments after modifications
 *
 * @param segments - Array of subtitle segments
 * @returns New array with sequential IDs starting from 0
 */
export function reindexSegments(segments: SubtitleSegment[]): SubtitleSegment[] {
  return segments.map((segment, index) => ({
    ...segment,
    id: index
  }));
}

/**
 * Get total duration covered by segments
 *
 * @param segments - Array of subtitle segments
 * @returns Total duration in seconds
 */
export function getTotalDuration(segments: SubtitleSegment[]): number {
  if (segments.length === 0) return 0;

  const sorted = sortSegmentsByTime(segments);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  return last.endTime - first.startTime;
}
