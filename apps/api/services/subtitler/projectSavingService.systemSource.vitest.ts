/** Each run from a system-storage source is its own project; no earlier export is overwritten. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findProjectByVideoFilename = vi.fn();
const createProject = vi.fn();
const updateSubtitledVideoPath = vi.fn();
const unlink = vi.fn();
const copyFile = vi.fn();

vi.mock('fs/promises', () => ({
  default: { mkdir: vi.fn(), copyFile, unlink },
}));
vi.mock('./index.js', () => ({
  getSubtitlerProjectService: () => ({
    ensureInitialized: async () => {},
    findProjectByVideoFilename,
    createProject,
    updateSubtitledVideoPath,
  }),
}));
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const { autoSaveProject } = await import('./projectSavingService.js');

const params = {
  userId: 'u1',
  outputPath: '/tmp/out.mp4',
  originalVideoPath: '/srv/system-media/s1.mp4',
  uploadId: 'parteitag-s1-abcd1234',
  originalFilename: 'Muster-Max_KV-Essen.mp4',
  segments: [],
  metadata: {} as never,
  sourceSystemMediaId: 'media-1',
};

beforeEach(() => {
  vi.clearAllMocks();
  findProjectByVideoFilename.mockResolvedValue({ id: 'old', subtitled_video_path: 'u1/old/x.mp4' });
  let n = 0;
  createProject.mockImplementation(async () => ({ id: `new-${++n}` }));
});

describe('autoSaveProject from system storage', () => {
  it('two runs create two projects and never unlink an earlier export', async () => {
    const a = await autoSaveProject(params);
    const b = await autoSaveProject({ ...params, uploadId: 'parteitag-s1-ffff0000' });

    expect(findProjectByVideoFilename).not.toHaveBeenCalled();
    expect(createProject).toHaveBeenCalledTimes(2);
    expect(createProject).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ sourceSystemMediaId: 'media-1' })
    );
    expect([a.projectId, b.projectId]).toEqual(['new-1', 'new-2']);
    expect(unlink).not.toHaveBeenCalled();
  });
});
