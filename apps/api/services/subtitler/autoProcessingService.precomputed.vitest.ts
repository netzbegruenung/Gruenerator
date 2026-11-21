/**
 * With stored word timings (parteitag speech) the auto pipeline skips the ASR
 * call; without words it falls back to transcription.
 */
import path from 'path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const transcribeVideo = vi.fn();
const generateManualSubtitles = vi.fn();

vi.mock('./transcriptionService.js', () => ({
  transcribeVideoWithWords: (...a: unknown[]) => transcribeVideo(...a),
}));
vi.mock('./manualSubtitleGeneratorService.js', () => ({
  generateManualSubtitles: (...a: unknown[]) => generateManualSubtitles(...a),
}));
vi.mock('./videoMetadata.js', () => ({
  probeVideoMetadata: async () => ({ width: 1280, height: 720, duration: 10 }),
}));
vi.mock('fs/promises', () => ({
  default: { stat: async () => ({ size: 1 }), unlink: async () => {}, mkdir: async () => {} },
}));
// The export stage needs ffmpeg; the assertions are about the step before it.
vi.mock('./ffmpegWrapper.js', () => ({
  ffmpeg: () => {
    throw new Error('ffmpeg unavailable in test');
  },
  ffmpegPath: '/usr/bin/ffmpeg',
}));
vi.mock('./ffmpegPool.js', () => ({ ffmpegPool: { run: vi.fn(), acquire: vi.fn() } }));
vi.mock('./projectSavingService.js', () => ({ autoSaveProject: vi.fn() }));
vi.mock('../sharedMediaService.js', () => ({ getSharedMediaService: vi.fn() }));
vi.mock('../../utils/redis/index.js', () => ({
  redisClient: { get: vi.fn().mockResolvedValue(null), set: vi.fn() },
}));
vi.mock('../../utils/reportBackgroundError.js', () => ({ reportBackgroundError: vi.fn() }));
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const { processVideoAutomatically } = await import('./autoProcessingService.js');

const SYSTEM_VIDEO = path.resolve('/srv/system-media/parteitage/s1.mp4');
const words = [{ word: 'Hallo', start: 0, end: 0.5 }];

beforeEach(() => {
  vi.clearAllMocks();
  generateManualSubtitles.mockResolvedValue('00:00.0 - 00:01.0\nHallo');
  transcribeVideo.mockResolvedValue({ subtitles: '00:00.0 - 00:01.0\nASR', words: [] });
});

describe('processVideoAutomatically precomputed', () => {
  it('precomputed words skip transcribeVideo', async () => {
    await processVideoAutomatically(SYSTEM_VIDEO, 'parteitag-s1-abcd1234', {
      precomputed: { fullText: 'Hallo', words },
      trustedSource: true,
    }).catch(() => {});
    expect(transcribeVideo).not.toHaveBeenCalled();
    expect(generateManualSubtitles).toHaveBeenCalledWith('Hallo', words);
  });

  it('empty words fall back to transcribeVideo', async () => {
    await processVideoAutomatically(SYSTEM_VIDEO, 'parteitag-s1-abcd1234', {
      precomputed: { fullText: 'Hallo', words: [] },
      trustedSource: true,
    }).catch(() => {});
    expect(generateManualSubtitles).not.toHaveBeenCalled();
    expect(transcribeVideo).toHaveBeenCalledTimes(1);
  });

  it('refuses a path outside uploads/ unless the source is trusted', async () => {
    await expect(
      processVideoAutomatically(SYSTEM_VIDEO, 'x', { precomputed: null })
    ).rejects.toThrow(/uploads directory/);
  });
});
