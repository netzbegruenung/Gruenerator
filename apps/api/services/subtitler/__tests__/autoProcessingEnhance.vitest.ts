/**
 * Optional speech enhancement in the auto pipeline: the enhanced file feeds
 * transcription and the saved project, and a provider failure never fails the reel.
 *
 * Run: `npx vitest run services/subtitler/__tests__/autoProcessingEnhance.vitest.ts`
 */
import path from 'path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const transcribeVideo = vi.fn();
const enhanceVideoAudio = vi.fn();
const autoSaveProject = vi.fn();
const redisSet = vi.fn();

vi.mock('../transcriptionService.js', () => ({
  transcribeVideo: (...a: unknown[]) => transcribeVideo(...a),
}));
vi.mock('../audioEnhance.js', () => ({
  enhanceVideoAudio: (...a: unknown[]) => enhanceVideoAudio(...a),
}));
vi.mock('../manualSubtitleGeneratorService.js', () => ({ generateManualSubtitles: vi.fn() }));
vi.mock('../videoMetadata.js', () => ({
  probeVideoMetadata: async () => ({ width: 720, height: 1280, duration: 10 }),
}));
vi.mock('fs/promises', () => ({
  default: {
    stat: async () => ({ size: 1 }),
    unlink: async () => {},
    mkdir: async () => {},
    copyFile: async () => {},
  },
}));
// The export stage needs ffmpeg; the assertions are about the steps before and after it.
vi.mock('../ffmpegWrapper.js', () => ({
  ffmpeg: () => {
    throw new Error('ffmpeg unavailable in test');
  },
  ffmpegPath: '/usr/bin/ffmpeg',
}));
// Export is skipped: the pool runs nothing, so processing reaches the save step.
vi.mock('../ffmpegPool.js', () => ({
  ffmpegPool: { run: vi.fn(async () => {}), acquire: vi.fn() },
}));
vi.mock('../assSubtitleService.js', () => ({
  default: class {
    generateAssContent() {
      return { content: '' };
    }
    createTempAssFile = async () => '/tmp/x.ass';
    mapStyleForLocale = (s: string) => s;
    getFontPathForStyle = () => '/tmp/f.ttf';
  },
}));
vi.mock('../projectSavingService.js', () => ({
  autoSaveProject: (...a: unknown[]) => autoSaveProject(...a),
}));
vi.mock('../../sharedMediaService.js', () => ({ getSharedMediaService: vi.fn() }));
vi.mock('../../../utils/redis/index.js', () => ({
  redisClient: { get: vi.fn().mockResolvedValue(null), set: (...a: unknown[]) => redisSet(...a) },
}));
vi.mock('../../../utils/reportBackgroundError.js', () => ({ reportBackgroundError: vi.fn() }));
vi.mock('../../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const { processVideoAutomatically, startAutoProcessing } =
  await import('../autoProcessingService.js');
const { AudioEnhanceError } = await import('../../voice/enhanceService.js');

const UPLOADS = path.resolve(__dirname, '../../../uploads/tus-temp');
const VIDEO = path.join(UPLOADS, 'up1');
const ENHANCED = path.join(UPLOADS, 'up1-enhanced.mp4');

function lastProgress(): Record<string, unknown> {
  const calls = redisSet.mock.calls.filter((c) => c[0] === 'auto:up1');
  return JSON.parse(calls[calls.length - 1][1] as string) as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  transcribeVideo.mockResolvedValue('00:00.0 - 00:01.0\nHallo');
  enhanceVideoAudio.mockResolvedValue({ durationSeconds: 10 });
});

describe('processVideoAutomatically enhanceAudio', () => {
  it('transcribes the enhanced file when enhanceAudio is on', async () => {
    await processVideoAutomatically(VIDEO, 'up1', { enhanceAudio: true });
    expect(enhanceVideoAudio).toHaveBeenCalledWith(VIDEO, ENHANCED);
    expect(transcribeVideo.mock.calls[0][0]).toBe(ENHANCED);
  });

  it('does not call the provider when enhanceAudio is off', async () => {
    await processVideoAutomatically(VIDEO, 'up1');
    expect(enhanceVideoAudio).not.toHaveBeenCalled();
    expect(transcribeVideo.mock.calls[0][0]).toBe(VIDEO);
  });

  it('keeps going with the original audio and a notice when enhancement fails', async () => {
    enhanceVideoAudio.mockRejectedValueOnce(new AudioEnhanceError('unavailable', 503, 'x'));
    await processVideoAutomatically(VIDEO, 'up1', { enhanceAudio: true });
    expect(transcribeVideo.mock.calls[0][0]).toBe(VIDEO);
    expect(lastProgress()).toMatchObject({
      notice: 'Der Ton konnte nicht verbessert werden – dein Reel nutzt den Originalton.',
    });
  });

  it('uses the length-specific notice for too_long', async () => {
    enhanceVideoAudio.mockRejectedValueOnce(new AudioEnhanceError('too_long', null, 'x'));
    await processVideoAutomatically(VIDEO, 'up1', { enhanceAudio: true });
    expect(lastProgress()).toMatchObject({
      notice: 'Ton verbessern geht bei Videos bis 5 Minuten – dein Reel nutzt den Originalton.',
    });
  });
});

describe('startAutoProcessing', () => {
  it('saves the enhanced file as originalVideoPath and completes with the notice', async () => {
    autoSaveProject.mockResolvedValue({ projectId: 'p1' });
    await startAutoProcessing({
      uploadId: 'up1',
      videoPath: VIDEO,
      originalFilename: 'clip.mp4',
      userId: 'u1',
      enhanceAudio: true,
    });
    await vi.waitFor(() => expect(lastProgress()).toMatchObject({ status: 'complete' }));
    expect(autoSaveProject.mock.calls[0][0].originalVideoPath).toBe(ENHANCED);
    expect(lastProgress().notice).toBeNull();
  });

  it('completes with the original audio and the notice when enhancement fails', async () => {
    enhanceVideoAudio.mockRejectedValueOnce(new AudioEnhanceError('rate_limited', 429, 'x'));
    autoSaveProject.mockResolvedValue({ projectId: 'p1' });
    await startAutoProcessing({
      uploadId: 'up1',
      videoPath: VIDEO,
      originalFilename: 'clip.mp4',
      userId: 'u1',
      enhanceAudio: true,
    });
    await vi.waitFor(() => expect(lastProgress()).toMatchObject({ status: 'complete' }));
    expect(autoSaveProject.mock.calls[0][0].originalVideoPath).toBe(VIDEO);
    expect(lastProgress().notice).toBe(
      'Der Ton konnte nicht verbessert werden – dein Reel nutzt den Originalton.'
    );
  });
});
