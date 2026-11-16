/** Re-export of a project that references system storage (parteitag speech). */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const access = vi.fn();
vi.mock('fs/promises', () => ({
  default: {
    access: (...a: unknown[]) => access(...a),
    stat: async () => {
      throw new Error('STOP after access');
    },
    mkdir: vi.fn(),
  },
}));
vi.mock('./ffmpegWrapper.js', () => ({ ffmpeg: vi.fn(), ffmpegPath: '/usr/bin/ffmpeg' }));
vi.mock('./videoMetadata.js', () => ({ probeVideoMetadata: vi.fn() }));
vi.mock('../../utils/redis/index.js', () => ({ redisClient: { get: vi.fn(), set: vi.fn() } }));
vi.mock('../localization/localeCache.js', () => ({
  getUserLocale: vi.fn(),
  LOCALE_UNSET: 'unset',
}));
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const { processProjectExport } = await import('./exportService.js');

const project = {
  id: 'p1',
  video_path: '/srv/system-media/parteitage/s1.mp4',
  video_metadata: { width: 1920, height: 1080, duration: 10 },
  subtitles: '[]',
};
const getVideoPath = vi.fn(() => {
  throw new Error('Path traversal detected in video path');
});

beforeEach(() => {
  vi.clearAllMocks();
  access.mockResolvedValue(undefined);
});

describe('processProjectExport with a system-storage source', () => {
  it('resolves the source through getVideoSource instead of throwing on the system path', async () => {
    const getVideoSource = vi.fn().mockResolvedValue({ path: project.video_path, system: true });
    await expect(
      processProjectExport(project as never, { getVideoPath, getVideoSource }, 'u1')
    ).rejects.toThrow(/STOP after access/);
    expect(getVideoSource).toHaveBeenCalledWith('u1', 'p1');
    expect(getVideoPath).not.toHaveBeenCalled();
    expect(access).toHaveBeenCalledWith(project.video_path);
  });

  it('fails cleanly when the source is gone (hidden or deleted speech)', async () => {
    const getVideoSource = vi.fn().mockResolvedValue({ path: null, system: true });
    await expect(
      processProjectExport(project as never, { getVideoPath, getVideoSource }, 'u1')
    ).rejects.toThrow(/Video file not found/);
  });
});
