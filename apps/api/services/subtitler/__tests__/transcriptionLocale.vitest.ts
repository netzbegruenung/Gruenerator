/**
 * Der manuelle Reel-Weg (Mobile) schickte kein Land mit — die Transkription
 * nahm deshalb die deutsche Wortliste. Das Land muss bis `transcribeVideo`
 * durchkommen.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const transcribeVideo = vi.fn();
vi.mock('../transcriptionService.js', () => ({ transcribeVideo }));
vi.mock('../tusService.js', () => ({
  getFilePathFromUploadId: (id: string) => `/tmp/${id}`,
  checkFileExists: () => Promise.resolve(true),
  markUploadAsProcessed: vi.fn(),
  scheduleImmediateCleanup: vi.fn(),
  getOriginalFilename: vi.fn(),
}));
vi.mock('../../../utils/redis/index.js', () => ({
  redisClient: { set: vi.fn().mockResolvedValue('OK') },
}));

const { startTranscriptionJob } = await import('../processingJobService.js');

beforeEach(() => {
  transcribeVideo.mockReset();
  transcribeVideo.mockResolvedValue('1\n00:00:00,000 --> 00:00:01,000\nText');
});

describe('startTranscriptionJob', () => {
  it('reicht das Land an die Transkription weiter', async () => {
    const result = await startTranscriptionJob({ uploadId: 'u1' }, 'de-AT');

    expect(result).toEqual({ ok: true });
    expect(transcribeVideo).toHaveBeenCalledWith('/tmp/u1', 'manual', 'de-AT');
  });
});
