/**
 * Subtitle Editor Utilities
 * Shared parsing, formatting, and helper functions for subtitle editing
 */

import type { SubtitleSegment } from './subtitle-types.js';

const MAX_SUBTITLE_TEXT_LENGTH = 500000;

function parseTimestamp(timeStr: string): { min: number; sec: number; frac: number } | null {
  const parts = timeStr.split(':');
  if (parts.length !== 2) return null;

  const minStr = parts[0];
  const secParts = parts[1].split('.');
  if (secParts.length !== 2) return null;

  const min = parseInt(minStr, 10);
  const sec = parseInt(secParts[0], 10);
  const frac = parseInt(secParts[1], 10);

  if (isNaN(min) || isNaN(sec) || isNaN(frac)) return null;
  if (sec < 0 || sec > 59 || frac < 0 || frac > 9) return null;

  return { min, sec, frac };
}

/**
 * Parse subtitle text format into segment array
 * Format: "MM:SS.F - MM:SS.F\nText\n\nMM:SS.F - MM:SS.F\nText..."
 *
 * @param text - Raw subtitle text from backend
 * @returns Array of parsed subtitle segments
 */
export function parseSubtitlesText(text: string | null | undefined): SubtitleSegment[] {
  if (!text || typeof text !== 'string' || text.trim() === '') {
    return [];
  }

  const safeText = text.length > MAX_SUBTITLE_TEXT_LENGTH ? text.slice(0, MAX_SUBTITLE_TEXT_LENGTH) : text;
  const segments: SubtitleSegment[] = [];
  const blocks = safeText.split('\n\n').filter((block) => block.trim() !== '');

  blocks.forEach((block, index) => {
    const lines = block.split('\n');
    const timeLine = lines[0];
    const textLines = lines.slice(1);

    const timeParts = timeLine.split(' - ');
    if (timeParts.length !== 2) return;

    const startParsed = parseTimestamp(timeParts[0].trim());
    const endParsed = parseTimestamp(timeParts[1].trim());

    if (!startParsed || !endParsed) return;

    const startTime = startParsed.min * 60 + startParsed.sec + startParsed.frac / 10;
    const endTime = endParsed.min * 60 + endParsed.sec + endParsed.frac / 10;

    segments.push({
      id: index,
      startTime,
      endTime,
      text: textLines.join('\n').trim(),
    });
  });

  return segments;
}

/**
 * Format segment array back to subtitle text format
 *
 * @param segments - Array of subtitle segments
 * @returns Formatted subtitle text
 */
export function formatSubtitlesToText(segments: SubtitleSegment[]): string {
  return segments
    .map((segment) => {
      const startFormatted = formatTimeWithFraction(segment.startTime);
      const endFormatted = formatTimeWithFraction(segment.endTime);
      return `${startFormatted} - ${endFormatted}\n${segment.text}`;
    })
    .join('\n\n');
}

/**
 * Format seconds to MM:SS display format
 *
 * @param seconds - Time in seconds
 * @returns Formatted time string "M:SS"
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format seconds to MM:SS.F format (with single decimal)
 *
 * @param seconds - Time in seconds
 * @returns Formatted time string "MM:SS.F"
 */
export function formatTimeWithFraction(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const frac = Math.round((seconds % 1) * 10);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${frac}`;
}

/**
 * Find the active segment at a given time
 *
 * @param segments - Array of subtitle segments
 * @param currentTime - Current playback time in seconds
 * @returns Active segment or null if none found
 */
export function findActiveSegment(
  segments: SubtitleSegment[],
  currentTime: number
): SubtitleSegment | null {
  return (
    segments.find(
      (segment) => currentTime >= segment.startTime && currentTime <= segment.endTime
    ) || null
  );
}

/**
 * Find the index of the active segment at a given time
 *
 * @param segments - Array of subtitle segments
 * @param currentTime - Current playback time in seconds
 * @returns Index of active segment or -1 if none found
 */
export function findActiveSegmentIndex(
  segments: SubtitleSegment[],
  currentTime: number
): number {
  return segments.findIndex(
    (segment) => currentTime >= segment.startTime && currentTime <= segment.endTime
  );
}

/**
 * Get the next segment after the current one
 *
 * @param segments - Array of subtitle segments
 * @param currentSegmentId - ID of current segment
 * @returns Next segment or null if at end
 */
export function getNextSegment(
  segments: SubtitleSegment[],
  currentSegmentId: number
): SubtitleSegment | null {
  const currentIndex = segments.findIndex((s) => s.id === currentSegmentId);
  if (currentIndex === -1 || currentIndex >= segments.length - 1) {
    return null;
  }
  return segments[currentIndex + 1];
}

/**
 * Get the previous segment before the current one
 *
 * @param segments - Array of subtitle segments
 * @param currentSegmentId - ID of current segment
 * @returns Previous segment or null if at start
 */
export function getPreviousSegment(
  segments: SubtitleSegment[],
  currentSegmentId: number
): SubtitleSegment | null {
  const currentIndex = segments.findIndex((s) => s.id === currentSegmentId);
  if (currentIndex <= 0) {
    return null;
  }
  return segments[currentIndex - 1];
}

/**
 * Validate a subtitle segment
 *
 * @param segment - Segment to validate
 * @returns Validation result with errors if any
 */
export function validateSegment(segment: SubtitleSegment): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (typeof segment.id !== 'number') {
    errors.push('Segment ID must be a number');
  }

  if (typeof segment.startTime !== 'number' || segment.startTime < 0) {
    errors.push('Start time must be a positive number');
  }

  if (typeof segment.endTime !== 'number' || segment.endTime < 0) {
    errors.push('End time must be a positive number');
  }

  if (segment.endTime <= segment.startTime) {
    errors.push('End time must be greater than start time');
  }

  if (typeof segment.text !== 'string') {
    errors.push('Text must be a string');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Deep clone segments array
 *
 * @param segments - Array of subtitle segments
 * @returns Deep cloned array
 */
export function cloneSegments(segments: SubtitleSegment[]): SubtitleSegment[] {
  return segments.map((segment) => ({ ...segment }));
}

/**
 * Check if two segment arrays are equal (for dirty checking)
 *
 * @param a - First segment array
 * @param b - Second segment array
 * @returns True if arrays are equal
 */
export function segmentsEqual(a: SubtitleSegment[], b: SubtitleSegment[]): boolean {
  if (a.length !== b.length) return false;

  return a.every(
    (segment, index) =>
      segment.id === b[index].id &&
      segment.startTime === b[index].startTime &&
      segment.endTime === b[index].endTime &&
      segment.text === b[index].text
  );
}
