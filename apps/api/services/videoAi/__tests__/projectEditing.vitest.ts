import { describe, expect, it, vi } from 'vitest';

import { type ProjectRow } from '../projectRepository.js';
import { type StoredVideoAiVersion } from '../projectTypes.js';
import { type Revision } from '../reviseEdl.js';

import { RADWEG_DURATION, radwegWords } from './fixtures.js';

const release = vi.fn(async () => undefined);
const appendVersion = vi.fn();

vi.mock('../defaults.js', async (original) => ({
  ...(await original<typeof import('../defaults.js')>()),
  reserveVideoAiTrees: vi.fn(async () => ({ ok: true, day: '2026-11-18' })),
}));
vi.mock('../../trees/index.js', async (original) => ({
  ...(await original<typeof import('../../trees/index.js')>()),
  getTreeBudget: () => ({ release }),
}));
vi.mock('../projectRepository.js', async (original) => ({
  ...(await original<typeof import('../projectRepository.js')>()),
  loadOwnProjectRow: vi.fn(async () => ROW),
  appendVersion,
}));

const { applyDirectOps, reviseProject } = await import('../projectEditing.js');
const { TREE_COST_VIDEO_AI_REVISION } = await import('../../trees/index.js');

const current: StoredVideoAiVersion = {
  version: 1,
  edl: {
    version: 1,
    format: '9:16',
    segments: ['c1.s5', 'c1.s6'].map((unitId) => ({ unitId })),
    captions: { enabled: true, template: 'tanne' },
    overlays: [],
    music: null,
  },
  summary: 'Erster Schnitt',
  omitted: {},
  rationale: null,
  createdAt: '2026-11-18T00:00:00.000Z',
};

// The columns reviseProject reads; a boundary cast like the DB row it stands for.
const ROW = {
  id: '00000000-0000-4000-8000-000000000001',
  user_id: 'user-1',
  slug_suffix: 'abc123',
  title: 'Radweg',
  locale: 'de-DE',
  status: 'ready',
  error: null,
  brief: {
    title: 'Radweg',
    format: '9:16',
    style: 'talking-head-ruhig',
  },
  inputs: [{ id: 'c1', mediaId: 'm-1', role: 'footage', title: 'Take 1' }],
  warnings: [],
  analysis: {
    clips: [
      {
        clipId: 'c1',
        role: 'footage',
        proxyMediaId: 'p',
        proxyShareToken: 'tok-c1',
        duration: RADWEG_DURATION,
        width: 1080,
        height: 1920,
        words: radwegWords(),
        detectors: { sceneCuts: [], quality: [] },
        cells: [],
      },
    ],
    assets: [],
  },
  versions: [current],
  current_version: 1,
  handed_off_at: null,
  created_at: new Date('2026-11-18T00:00:00.000Z'),
} as unknown as ProjectRow;

describe('reviseProject', () => {
  it('gives the revision trees back when storing the version throws, then rethrows', async () => {
    appendVersion.mockRejectedValueOnce(new Error('connection reset'));
    const revise = async (): Promise<Revision> => ({
      edl: current.edl,
      omitted: {},
      summary: 'Kürzer',
      reply: 'Erledigt.',
      changed: true,
    });

    await expect(
      reviseProject(ROW.id, 'user-1', { baseVersion: 1, feedback: 'Kürzer' }, revise)
    ).rejects.toThrow('connection reset');
    expect(release).toHaveBeenCalledWith('user-1', TREE_COST_VIDEO_AI_REVISION, '2026-11-18');
  });
});

describe('applyDirectOps', () => {
  it('holds direct changes to the design rules of the first cut', async () => {
    appendVersion.mockClear();
    const title = (text: string, atSegment: number) =>
      ({
        kind: 'add_overlay',
        overlay: { kind: 'titel', preset: 'statement', text, atSegment, durationSeconds: 3 },
      }) as const;

    const result = await applyDirectOps(ROW.id, 'user-1', {
      baseVersion: 1,
      ops: [title('Sicherer Schulweg', 0), title('Jetzt bauen', 1), title('Für alle Kinder', 1)],
    });

    expect(result).toEqual({ ok: false, status: 400, error: 'Höchstens 2 Titel, nicht 3.' });
    expect(appendVersion).not.toHaveBeenCalled();
  });
});
