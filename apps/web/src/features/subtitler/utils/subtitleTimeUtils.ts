/**
 * Subtitle time parsing and formatting utilities
 *
 * Consolidates duplicate time handling logic from:
 * - SubtitleEditor.tsx (lines 346-360, 528-533)
 * - videoEditor/Timeline.tsx (lines 71-76, 488-492)
 *
 * Provides a single source of truth for subtitle time operations.
 */

/**
 * Parse subtitle time string in "M:SS.F" format to seconds
 *
 * @example
 * parseSubtitleTime("1:23.4") // returns 83.4
 * parseSubtitleTime("0:05.2") // returns 5.2
 * parseSubtitleTime("12:34.5") // returns 754.5
 *
 * @param timeStr - Time string in "M:SS.F" or "MM:SS.F" format
 * @returns Time in seconds with fractional part, or 0 if invalid format
 */
export function parseSubtitleTime(timeStr: string): number {
  const match = timeStr.match(/(\d+):(\d{2})\.(\d)/);
  if (!match) {
    console.warn('[subtitleTimeUtils] Invalid time format:', timeStr);
    return 0;
  }

  const [, mins, secs, tenths] = match;
  return parseInt(mins, 10) * 60 + parseInt(secs, 10) + parseInt(tenths, 10) / 10;
}

/**
 * Format seconds to subtitle time string with fractional second
 *
 * @example
 * formatSubtitleTime(83.4) // returns "1:23.4"
 * formatSubtitleTime(5.2) // returns "0:05.2"
 * formatSubtitleTime(754.5) // returns "12:34.5"
 *
 * @param seconds - Time in seconds (may include fractional part)
 * @returns Formatted time string in "M:SS.F" format
 */
export function formatSubtitleTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const wholeSeconds = Math.floor(seconds % 60);
  const fractionalSecond = Math.floor((seconds % 1) * 10);

  return `${mins}:${wholeSeconds.toString().padStart(2, '0')}.${fractionalSecond}`;
}

/**
 * Format seconds to display time string without fractional seconds
 *
 * @example
 * formatDisplayTime(83.4) // returns "1:23"
 * formatDisplayTime(5.2) // returns "0:05"
 * formatDisplayTime(754.9) // returns "12:34"
 *
 * @param seconds - Time in seconds
 * @returns Formatted time string in "M:SS" format
 */
export function formatDisplayTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);

  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Parse full time range string "M:SS.F - M:SS.F"
 *
 * @example
 * parseTimeRange("1:23.4 - 1:28.5") // returns { start: 83.4, end: 88.5 }
 * parseTimeRange("0:05.2-0:10.3") // returns { start: 5.2, end: 10.3 }
 *
 * @param timeLine - Time range string in "M:SS.F - M:SS.F" format
 * @returns Object with start and end times in seconds, or null if invalid
 */
export function parseTimeRange(timeLine: string): { start: number; end: number } | null {
  const timeMatch = timeLine.match(/(\d+:\d{2}\.\d)\s*-\s*(\d+:\d{2}\.\d)/);
  if (!timeMatch) {
    console.warn('[subtitleTimeUtils] Invalid time range format:', timeLine);
    return null;
  }

  const [, startStr, endStr] = timeMatch;
  return {
    start: parseSubtitleTime(startStr),
    end: parseSubtitleTime(endStr),
  };
}

/**
 * Format time range from start and end seconds
 *
 * @example
 * formatTimeRange(83.4, 88.5) // returns "1:23.4 - 1:28.5"
 * formatTimeRange(5.2, 10.3) // returns "0:05.2 - 0:10.3"
 *
 * @param startTime - Start time in seconds
 * @param endTime - End time in seconds
 * @returns Formatted time range string
 */
export function formatTimeRange(startTime: number, endTime: number): string {
  return `${formatSubtitleTime(startTime)} - ${formatSubtitleTime(endTime)}`;
}

/**
 * Format time with full zero-padding (used for export formats)
 *
 * @example
 * formatPaddedTime(83.4) // returns "01:23.4"
 * formatPaddedTime(5.2) // returns "00:05.2"
 * formatPaddedTime(754.5) // returns "12:34.5"
 *
 * @param seconds - Time in seconds
 * @returns Formatted time string with padded minutes
 */
export function formatPaddedTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const wholeSeconds = Math.floor(seconds % 60);
  const fractionalSecond = Math.floor((seconds % 1) * 10);

  return `${mins.toString().padStart(2, '0')}:${wholeSeconds.toString().padStart(2, '0')}.${fractionalSecond}`;
}

/**
 * Validate time value is within reasonable bounds
 *
 * @param seconds - Time in seconds
 * @returns true if valid (0 to 24 hours), false otherwise
 */
export function isValidTime(seconds: number): boolean {
  return !isNaN(seconds) && seconds >= 0 && seconds < 86400; // 24 hours
}
