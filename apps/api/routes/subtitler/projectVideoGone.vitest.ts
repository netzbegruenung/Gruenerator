/** GET /api/subtitler/projects/:id/video for a source that lives in system storage. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getVideoSource = vi.fn();

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  const promises = { ...actual.promises, access: vi.fn().mockRejectedValue(new Error('ENOENT')) };
  return { ...actual, default: { ...actual, promises }, promises };
});
vi.mock('../../middleware/authMiddleware.js', () => ({
  requireAuth: (_q: unknown, _s: unknown, next: () => void) => next(),
}));
vi.mock('../../services/subtitler/index.js', () => ({
  getSubtitlerProjectService: () => ({
    ensureInitialized: async () => {},
    getVideoSource: (...a: unknown[]) => getVideoSource(...a),
  }),
}));
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const router = (await import('./projectController.js')).default;

type Layer = { route?: { path: string; stack: { handle: (...a: unknown[]) => Promise<void> }[] } };

async function getVideo() {
  const layer = (router.stack as Layer[]).find((l) => l.route?.path === '/:projectId/video');
  const handler = layer!.route!.stack.at(-1)!.handle;
  const res = {
    statusCode: 0,
    body: null as unknown,
    headersSent: false,
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    json(b: unknown) {
      this.body = b;
    },
  };
  await handler({ user: { id: 'u1' }, params: { projectId: 'p1' }, headers: {} }, res);
  return res;
}

beforeEach(() => vi.clearAllMocks());

describe('project video route', () => {
  it('returns 410 SOURCE_GONE when source_system_media_id is null and video_path is missing', async () => {
    getVideoSource.mockResolvedValue({ path: '/srv/system-media/gone.mp4', system: true });
    const res = await getVideo();
    expect(res.statusCode).toBe(410);
    expect(res.body).toMatchObject({ code: 'SOURCE_GONE' });
  });

  it('keeps 404 for a missing file of a regular project', async () => {
    getVideoSource.mockResolvedValue({ path: '/p/video.mp4', system: false });
    const res = await getVideo();
    expect(res.statusCode).toBe(404);
  });
});
