/**
 * The subtitler export reads, overwrites and creates reel projects under the
 * userId it is given. That id must come from the session: shipped mobile
 * builds still send `userId` in the body, and trusting it let any user act on
 * another user's projects.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const startSubtitledVideoExport = vi.fn();
const startAutoProcessing = vi.fn();

vi.mock('../../services/subtitler/processingJobService.js', () => ({
  startSubtitledVideoExport: (...a: unknown[]) => startSubtitledVideoExport(...a),
  startTranscriptionJob: vi.fn(),
}));
vi.mock('../../services/subtitler/autoProcessingService.js', () => ({
  startAutoProcessing: (...a: unknown[]) => startAutoProcessing(...a),
}));
vi.mock('../../services/subtitler/tusService.js', () => ({
  checkFileExists: async () => true,
  getFilePathFromUploadId: (id: string) => `/tmp/${id}`,
  getOriginalFilename: async () => 'clip.mp4',
  scheduleImmediateCleanup: vi.fn(),
}));
vi.mock('../../utils/redis/index.js', () => ({ redisClient: { get: vi.fn(), set: vi.fn() } }));
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const { subtitlerContractRouter } = await import('./subtitlerContractRouter.js');

const req = { user: { id: 'session-user', locale: 'de-DE' }, headers: {} };

beforeEach(() => vi.clearAllMocks());

describe('subtitler handlers take the owner from the session', () => {
  it('postExport ignores body.userId', async () => {
    startSubtitledVideoExport.mockResolvedValue({ ok: true, exportToken: 't' });

    await subtitlerContractRouter.postExport({
      body: { uploadId: 'u', userId: 'victim', projectId: 'p', subtitles: [] },
      req,
    } as never);

    expect(startSubtitledVideoExport).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'session-user' })
    );
  });

  it('postProcessAuto never falls back to body.userId', async () => {
    startAutoProcessing.mockResolvedValue({ ok: true });

    await subtitlerContractRouter.postProcessAuto({
      body: { uploadId: 'u', userId: 'victim' },
      req: { headers: {} },
    } as never);

    expect(startAutoProcessing).toHaveBeenCalledWith(expect.objectContaining({ userId: null }));
  });
});
