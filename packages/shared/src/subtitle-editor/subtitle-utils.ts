/**
 * Subtitle Editor Utilities
 * Shared parsing, formatting, and helper functions for subtitle editing
 */

import type { SubtitleSegment } from './subtitle-types.js';

const MAX_SUBTITLE_TEXT_LENGTH = 500000;

function parseTimestamp(timeStr: string): { min: number; sec: number; fracSeconds: number } | null {
  const parts = timeStr.split(':');
  if (parts.length !== 2) return null;

  const minStr = parts[0];
  const secParts = parts[1].split('.');
  if (secParts.length !== 2) return null;

  const min = parseInt(minStr, 10);
  const sec = parseInt(secParts[0], 10);

  // Tolerant fraction handling: accept 1–2 fractional digits (tenths or
  // centiseconds) and silently truncate anything beyond — rejecting would
  // drop the whole segment. Emitters stay at one digit until the Phase B
  // formatter switch (see manualSubtitleGeneratorService.formatTime).
  if (!/^\d+$/.test(secParts[1])) return null;
  const fracStr = secParts[1].slice(0, 2);
  const fracSeconds = parseInt(fracStr, 10) / 10 ** fracStr.length;

  if (isNaN(min) || isNaN(sec)) return null;
  if (min < 0 || sec < 0 || sec > 59) return null;

  return { min, sec, fracSeconds };
}

/**
 * Parse a JSON-stored segment array: `JSON.stringify(SubtitleSegment[])`
 * as written by the canonicalized POST /subtitler/projects create path
 * (projectSavingService stores `JSON.stringify(projectData.subtitles)`).
 * The wire segments carry no `id`; indexes are assigned here. Returns null
 * when the string isn't a valid segment array so the caller can fall back
 * to the text format.
 */
function parseJsonSegments(text: string): SubtitleSegment[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const segments: SubtitleSegment[] = [];
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) return null;
    const segment = item as Record<string, unknown>;
    if (
      typeof segment.text !== 'string' ||
      typeof segment.startTime !== 'number' ||
      typeof segment.endTime !== 'number'
    ) {
      return null;
    }
    segments.push({
      id: segments.length,
      startTime: segment.startTime,
      endTime: segment.endTime,
      text: segment.text,
    });
  }
  return segments;
}

/**
 * Parse stored subtitles into a segment array. Accepts BOTH persisted
 * formats — the DB `subtitles` column holds either depending on which
 * code path wrote it:
 * - JSON segment array (`[{"text":…,"startTime":…,"endTime":…}]`) from the
 *   canonicalized create path (2026-04-13 contract unification)
 * - Text format "MM:SS.F - MM:SS.F\nText\n\n…" from the update path and
 *   the transcription pipeline. Accepts 1–2 fractional digits per
 *   timestamp (tenths or centiseconds); extra digits are truncated.
 *
 * @param text - Raw subtitle string from backend
 * @returns Array of parsed subtitle segments
 */
export function parseSubtitlesText(text: string | null | undefined): SubtitleSegment[] {
  if (!text || typeof text !== 'string' || text.trim() === '') {
    return [];
  }

  if (text.trimStart().startsWith('[')) {
    const fromJson = parseJsonSegments(text);
    if (fromJson) return fromJson;
  }

  const safeText =
    text.length > MAX_SUBTITLE_TEXT_LENGTH ? text.slice(0, MAX_SUBTITLE_TEXT_LENGTH) : text;
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

    const startTime = startParsed.min * 60 + startParsed.sec + startParsed.fracSeconds;
    const endTime = endParsed.min * 60 + endParsed.sec + endParsed.fracSeconds;

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

export type StoredSubtitlesFormat = 'json' | 'text';

/**
 * Parse whatever the `subtitler_projects.subtitles` column holds. The column
 * has two formats in the wild: a JSON-stringified segment array (written by
 * projectSavingService for auto-saved and contract-created projects) and the
 * "MM:SS.F - MM:SS.F\nText" text format (parseSubtitlesText). Returns the
 * detected format so writers can round-trip without converting the project.
 */
export function parseStoredSubtitles(blob: string | null | undefined): {
  segments: SubtitleSegment[];
  format: StoredSubtitlesFormat;
} {
  const trimmed = (blob ?? '').trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        const segments: SubtitleSegment[] = [];
        for (const [index, entry] of parsed.entries()) {
          if (typeof entry !== 'object' || entry === null) continue;
          const rec = entry as Record<string, unknown>;
          if (
            typeof rec.text !== 'string' ||
            typeof rec.startTime !== 'number' ||
            typeof rec.endTime !== 'number'
          ) {
            continue;
          }
          segments.push({
            id: typeof rec.id === 'number' ? rec.id : index,
            startTime: rec.startTime,
            endTime: rec.endTime,
            text: rec.text,
          });
        }
        return { segments, format: 'json' };
      }
    } catch {
      // fall through to the text parser
    }
  }
  return { segments: parseSubtitlesText(trimmed), format: 'text' };
}

/**
 * Serialize segments back into the format they were read from, so editing a
 * project never silently migrates its storage format.
 */
export function serializeStoredSubtitles(
  segments: SubtitleSegment[],
  format: StoredSubtitlesFormat
): string {
  if (format === 'json') {
    return JSON.stringify(
      segments.map((s) => ({ text: s.text, startTime: s.startTime, endTime: s.endTime }))
    );
  }
  return formatSubtitlesToText(segments);
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
 * Intentionally emits ONE fractional digit until the Phase B precision
 * switch (deployed mobile parsers must be tolerant first).
 *
 * @param seconds - Time in seconds
 * @returns Formatted time string "MM:SS.F"
 */
export function formatTimeWithFraction(seconds: number): string {
  // Integer tenths with carry: the old `Math.round((s % 1) * 10)` emitted
  // an invalid two-digit fraction slot for inputs like 5.96s ("00:05.10").
  const totalTenths = Math.max(0, Math.round(seconds * 10));
  const frac = totalTenths % 10;
  const totalSecs = (totalTenths - frac) / 10;
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
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
  // End boundary is exclusive: with adjacent segments (a.end === b.start)
  // an inclusive check would match both at the exact boundary time.
  return (
    segments.find((segment) => currentTime >= segment.startTime && currentTime < segment.endTime) ||
    null
  );
}

/**
 * Find the index of the active segment at a given time
 *
 * @param segments - Array of subtitle segments
 * @param currentTime - Current playback time in seconds
 * @returns Index of active segment or -1 if none found
 */
export function findActiveSegmentIndex(segments: SubtitleSegment[], currentTime: number): number {
  return segments.findIndex(
    (segment) => currentTime >= segment.startTime && currentTime < segment.endTime
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

export interface SubtitleValidationIssue {
  /** Index of the offending segment in the input array */
  index: number;
  type: 'empty-text' | 'invalid-times' | 'overlap' | 'exceeds-duration';
  message: string;
}

export interface SubtitleValidationResult {
  issues: SubtitleValidationIssue[];
  /** True when every segment has empty/whitespace-only text */
  allEmpty: boolean;
}

/**
 * Validate a full segment list before export/save: empty texts,
 * non-positive durations, overlaps between neighbours (in start order)
 * and segments running past the video duration.
 *
 * @param segments - Segments to validate (id not required)
 * @param videoDuration - Video duration in seconds, if known
 */
export function validateSubtitleSegments(
  segments: ReadonlyArray<Pick<SubtitleSegment, 'startTime' | 'endTime' | 'text'>>,
  videoDuration?: number | null
): SubtitleValidationResult {
  const issues: SubtitleValidationIssue[] = [];

  const formatRange = (segment: Pick<SubtitleSegment, 'startTime' | 'endTime'>): string =>
    `${formatTime(segment.startTime)}–${formatTime(segment.endTime)}`;

  segments.forEach((segment, index) => {
    if (segment.text.trim() === '') {
      issues.push({
        index,
        type: 'empty-text',
        message: `Untertitel ${index + 1} (${formatRange(segment)}) hat keinen Text.`,
      });
    }
    if (segment.endTime <= segment.startTime || segment.startTime < 0) {
      issues.push({
        index,
        type: 'invalid-times',
        message: `Untertitel ${index + 1} hat ungültige Zeiten (${formatRange(segment)}).`,
      });
    }
    if (videoDuration != null && videoDuration > 0 && segment.endTime > videoDuration) {
      issues.push({
        index,
        type: 'exceeds-duration',
        message: `Untertitel ${index + 1} endet nach dem Videoende (${formatRange(segment)}).`,
      });
    }
  });

  const byStart = segments
    .map((segment, index) => ({ segment, index }))
    .sort((a, b) => a.segment.startTime - b.segment.startTime);
  for (let i = 1; i < byStart.length; i++) {
    const prev = byStart[i - 1];
    const curr = byStart[i];
    if (curr.segment.startTime < prev.segment.endTime) {
      issues.push({
        index: curr.index,
        type: 'overlap',
        message: `Untertitel ${prev.index + 1} und ${curr.index + 1} überschneiden sich zeitlich.`,
      });
    }
  }

  return {
    issues,
    allEmpty: segments.length > 0 && segments.every((segment) => segment.text.trim() === ''),
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
