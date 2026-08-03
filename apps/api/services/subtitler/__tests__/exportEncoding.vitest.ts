/**
 * Guards for the two halves of the "10-bit upload kills the export" bug:
 * the encoder must pin an 8-bit pixel format, and no FFmpeg stderr may ever
 * reach a job status the UI renders.
 */
import { describe, expect, it } from 'vitest';

import { classifyUserFacingError, toUserFacingMessage } from '../../../utils/errors/userFacing.js';
import { buildFFmpegOutputOptions } from '../ffmpegExportUtils.js';

const metadata = (overrides: Record<string, unknown> = {}) => ({
  width: 1080,
  height: 1920,
  duration: '30',
  ...overrides,
});

const FFMPEG_10BIT_FAILURE = new Error(
  "FFmpeg exited with code 1: [Parsed_subtitles_0 @ 0x56073c456000] Using font provider fontconfig\nx264 [error]: high profile doesn't support a bit depth of 10\n[libx264 @ 0x560739bb0c40] Error setting profile high."
);

describe('CPU encode pixel format', () => {
  it('pins yuv420p so 10-bit sources do not collide with the 8-bit profile', () => {
    const { outputOptions } = buildFFmpegOutputOptions({
      metadata: metadata() as never,
      fileStats: { size: 50 * 1024 * 1024 },
      useHwAccel: false,
    });

    const pixFmtIndex = outputOptions.indexOf('-pix_fmt');
    expect(pixFmtIndex).toBeGreaterThan(-1);
    expect(outputOptions[pixFmtIndex + 1]).toBe('yuv420p');
  });

  it('keeps profile and pixel format together for a 10-bit HEVC source', () => {
    const { outputOptions } = buildFFmpegOutputOptions({
      metadata: metadata({
        originalFormat: { codec: 'hevc', pixelFormat: 'yuv420p10le' },
      }) as never,
      fileStats: { size: 50 * 1024 * 1024 },
      useHwAccel: false,
    });

    expect(outputOptions).toContain('-profile:v');
    expect(outputOptions).toContain('yuv420p');
  });
});

describe('user-facing error classification', () => {
  it('never leaks FFmpeg stderr and names the actual remedy', () => {
    const message = toUserFacingMessage(FFMPEG_10BIT_FAILURE);
    expect(message).not.toMatch(/ffmpeg|libx264|0x/i);
    expect(message).toMatch(/MP4/);
  });

  it('classifies the 10-bit failure as unsupported media, not retryable', () => {
    const result = classifyUserFacingError(FFMPEG_10BIT_FAILURE);
    expect(result.code).toBe('unsupported_media');
    expect(result.retryable).toBe(false);
  });

  it('marks a full disk as retryable', () => {
    const result = classifyUserFacingError(new Error('ENOSPC: no space left on device'));
    expect(result.code).toBe('storage_full');
    expect(result.retryable).toBe(true);
    expect(result.message).toMatch(/Speicherplatz/);
  });

  it('falls back to the generic message for unclassified tooling output', () => {
    const result = classifyUserFacingError(new Error('ffprobe exited with code 3: whatever'));
    expect(result.code).toBe('internal');
    expect(result.message).toMatch(/schiefgegangen/);
  });

  it('passes through messages we authored ourselves', () => {
    expect(toUserFacingMessage(new Error('Alle Untertitel sind leer'))).toBe(
      'Alle Untertitel sind leer'
    );
  });

  it('prefers a caller fallback over the generic text when nothing is usable', () => {
    expect(toUserFacingMessage({}, 'Die Suche ist fehlgeschlagen.')).toBe(
      'Die Suche ist fehlgeschlagen.'
    );
    expect(toUserFacingMessage(null, 'Die Suche ist fehlgeschlagen.')).toBe(
      'Die Suche ist fehlgeschlagen.'
    );
  });
});
