/**
 * POST /api/subtitler/process-parteitag: access gate, storage resolution and the
 * hand-over of stored word timings to the auto pipeline.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const startAutoProcessing = vi.fn();
const getSpeech = vi.fn();
const getConventionById = vi.fn();
const hasGrant = vi.fn();
const getMedia = vi.fn();
const resolveLocalPath = vi.fn();
const stat = vi.fn();
const viewerFromRequest = vi.fn();

vi.mock('../../services/subtitler/autoProcessingService.js', () => ({
  startAutoProcessing: (...a: unknown[]) => startAutoProcessing(...a),
}));
vi.mock('../../services/subtitler/processingJobService.js', () => ({
  startSubtitledVideoExport: vi.fn(),
  startTranscriptionJob: vi.fn(),
}));
vi.mock('../../services/subtitler/tusService.js', () => ({
  checkFileExists: async () => true,
  getFilePathFromUploadId: (id: string) => `/tmp/${id}`,
  getOriginalFilename: async () => 'clip.mp4',
  scheduleImmediateCleanup: vi.fn(),
}));
vi.mock('../../services/parteitage/parteitageRepository.js', () => ({
  getSpeech: (...a: unknown[]) => getSpeech(...a),
  getConventionById: (...a: unknown[]) => getConventionById(...a),
  hasGrant: (...a: unknown[]) => hasGrant(...a),
}));
vi.mock('../../services/parteitage/parteitageViews.js', () => ({
  getMedia: (...a: unknown[]) => getMedia(...a),
  downloadBaseName: () => 'Muster-Max_KV-Essen',
}));
vi.mock('../../services/parteitage/access.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/parteitage/access.js')>()),
  viewerFromRequest: (...a: unknown[]) => viewerFromRequest(...a),
}));
vi.mock('../../services/systemMedia/storage.js', () => ({
  getSystemMediaStorage: () => ({
    resolveLocalPath: (...a: unknown[]) => resolveLocalPath(...a),
    stat: (...a: unknown[]) => stat(...a),
  }),
}));
vi.mock('../../utils/redis/index.js', () => ({ redisClient: { get: vi.fn(), set: vi.fn() } }));
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const { subtitlerContractRouter } = await import('./subtitlerContractRouter.js');

let req: { user: Record<string, unknown>; headers: object } = {
  user: { id: 'u1', locale: 'de-DE' },
  headers: {},
};
const words = [
  { word: 'Hallo', start: 0, end: 0.5 },
  { word: 'Welt', start: 0.5, end: 1 },
];
const speech = {
  id: 's1',
  convention_id: 'c1',
  moderation: 'ok',
  transcript: 'Hallo Welt',
  words,
  reel_media_id: 'm1',
};
const convention = { id: 'c1', status: 'published', audience: 'all', access_password_hash: null };

function call(speechId = 's1') {
  return subtitlerContractRouter.postProcessFromParteitag({
    body: { speechId },
    req,
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  req = { user: { id: 'u1', locale: 'de-DE' }, headers: {} };
  viewerFromRequest.mockResolvedValue({ userId: 'u1', isAdmin: false, audience: 'de-DE' });
  getSpeech.mockResolvedValue(speech);
  getConventionById.mockResolvedValue(convention);
  hasGrant.mockResolvedValue(false);
  getMedia.mockResolvedValue({ id: 'm1', storage_key: 'parteitage/essen/s1.mp4' });
  resolveLocalPath.mockReturnValue('/data/system-media/parteitage/essen/s1.mp4');
  stat.mockResolvedValue({ size: 270 });
  startAutoProcessing.mockResolvedValue(undefined);
});

describe('postProcessFromParteitag', () => {
  it('locked convention -> 403 LOCKED', async () => {
    getConventionById.mockResolvedValue({ ...convention, access_password_hash: 'salt:hash' });
    const res = await call();
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'LOCKED' });
    expect(startAutoProcessing).not.toHaveBeenCalled();
  });

  it('hidden speech -> 404 NOT_FOUND', async () => {
    getSpeech.mockResolvedValue({ ...speech, moderation: 'hidden' });
    const res = await call();
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: 'NOT_FOUND' });
    expect(startAutoProcessing).not.toHaveBeenCalled();
  });

  it('ok -> 202 with a parteitag- uploadId and the stored timings', async () => {
    const res = await call();
    expect(res.status).toBe(202);
    const uploadId = (res.body as { uploadId: string }).uploadId;
    expect(uploadId).toMatch(/^parteitag-s1-[0-9a-f]{8}$/);
    expect(startAutoProcessing).toHaveBeenCalledWith(
      expect.objectContaining({
        uploadId,
        videoPath: '/data/system-media/parteitage/essen/s1.mp4',
        userId: 'u1',
        precomputed: { fullText: 'Hallo Welt', words },
        sourceSystemMediaId: 'm1',
      })
    );
  });

  it('remote storage -> 501 STORAGE_REMOTE', async () => {
    resolveLocalPath.mockReturnValue(null);
    const res = await call();
    expect(res.status).toBe(501);
    expect(res.body).toMatchObject({ code: 'STORAGE_REMOTE' });
  });

  it('missing file -> 410 SOURCE_GONE', async () => {
    stat.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(410);
    expect(res.body).toMatchObject({ code: 'SOURCE_GONE' });
  });

  describe('speech without word timings (ASR fallback)', () => {
    it('without AI consent -> refused with the consent response, nothing started', async () => {
      getSpeech.mockResolvedValue({ ...speech, words: [] });
      const res = await call();
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ code: 'ai_consent_required' });
      expect(startAutoProcessing).not.toHaveBeenCalled();
    });

    it('with AI consent -> starts', async () => {
      getSpeech.mockResolvedValue({ ...speech, words: [] });
      req.user.ai_consent_at = new Date();
      const res = await call();
      expect(res.status).toBe(202);
    });

    it('stored words need no consent', async () => {
      const res = await call();
      expect(res.status).toBe(202);
    });
  });
});
