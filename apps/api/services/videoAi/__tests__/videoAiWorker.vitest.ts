import { describe, expect, it, vi } from 'vitest';

import { FALLBACK_CUT_RATIONALE } from '../fallbackPlan.js';
import { type StoredClipAnalysis, type StoredVideoAiVersion } from '../projectTypes.js';
import {
  GENERIC_FAILURE,
  handleFailure,
  processClaimed,
  type ClaimedProject,
  type VideoAiWorkerDeps,
} from '../videoAiWorker.js';

import { RADWEG_DURATION, radwegWords } from './fixtures.js';

vi.mock('../../../utils/reportBackgroundError.js', () => ({ reportBackgroundError: vi.fn() }));

const ROW: ClaimedProject = {
  id: '00000000-0000-4000-8000-000000000001',
  user_id: 'user-1',
  slug_suffix: 'abc123',
  title: 'Radweg',
  locale: 'de-DE',
  brief: {
    title: 'Radweg',
    topic: 'Radweg Sauerlacher Straße',
    format: '9:16',
    style: 'talking-head-ruhig',
    target: { minSeconds: 30, maxSeconds: 45 },
    person: { name: 'Annika Wolfsteiner', role: 'Stadträtin' },
  },
  inputs: [
    { id: 'c1', mediaId: 'm-1', role: 'footage', title: 'Take 1' },
    { id: 'c2', mediaId: 'm-2', role: 'broll', title: 'Kinder' },
    { id: 'a1', mediaId: 'm-3', role: 'image', title: 'strasse.jpg' },
  ],
  analysis: null,
  attempts: 1,
  tree_units: 100,
  tree_day: '2026-11-10',
};

function clip(clipId: string, role: 'footage' | 'broll'): StoredClipAnalysis {
  return {
    clipId,
    role,
    proxyMediaId: `proxy-${clipId}`,
    proxyShareToken: `tok-${clipId}`,
    duration: role === 'footage' ? RADWEG_DURATION : 8,
    width: 1080,
    height: 1920,
    words: role === 'footage' ? radwegWords() : [],
    detectors: {
      silences: [],
      sceneCuts: [],
      quality: [],
      loudness: { integratedLufs: null, lra: null },
    },
    cells: [],
  };
}

interface Harness {
  deps: VideoAiWorkerDeps;
  sql: string[];
  finished: () => StoredVideoAiVersion[] | null;
  saved: () => number;
}

function harness(overrides: Partial<VideoAiWorkerDeps> = {}, cancelled = false): Harness {
  const sql: string[] = [];
  let versions: StoredVideoAiVersion[] | null = null;
  let saves = 0;
  const deps: VideoAiWorkerDeps = {
    db: {
      query: async <T>(text: string, params: unknown[] = []): Promise<T[]> => {
        sql.push(text);
        if (text.includes("SET status = 'ready'")) versions = JSON.parse(params[1] as string);
        if (text.includes('SET analysis')) saves++;
        if (cancelled && text.includes('SET status = $2')) return [];
        return [{ id: ROW.id }] as T[];
      },
    },
    analyzeClip: vi.fn(async (_job, input) => clip(input.id, input.role)),
    analyzeAssets: vi.fn(async () => [
      { id: 'a1', kind: 'image' as const, description: 'Enge Straße', durationSeconds: null },
    ]),
    decideCut: vi.fn(async () => {
      throw new Error('not set');
    }),
    decideDesign: vi.fn(async () => {
      throw new Error('not set');
    }),
    notify: vi.fn(async () => undefined),
    releaseTrees: vi.fn(async () => undefined),
    ...overrides,
  };
  return { deps, sql, finished: () => versions, saved: () => saves };
}

describe('processClaimed', () => {
  it('analyses every clip once, saving after each, and resumes where it stopped', async () => {
    const h = harness();
    await processClaimed(ROW, h.deps);
    expect(h.deps.analyzeAssets).toHaveBeenCalledTimes(1);
    expect(h.deps.analyzeClip).toHaveBeenCalledTimes(2);
    expect(h.saved()).toBe(3);

    const resumed = harness();
    await processClaimed(
      { ...ROW, analysis: { clips: [clip('c1', 'footage')], assets: [] } },
      resumed.deps
    );
    expect(resumed.deps.analyzeAssets).not.toHaveBeenCalled();
    expect(resumed.deps.analyzeClip).toHaveBeenCalledTimes(1);
    expect(vi.mocked(resumed.deps.analyzeClip).mock.calls[0][1].id).toBe('c2');
  });

  it('falls back to the conservative plan when the cut gives up, and still finishes', async () => {
    const h = harness();
    await processClaimed(ROW, h.deps);

    const [version] = h.finished() ?? [];
    expect(version.rationale).toBe(FALLBACK_CUT_RATIONALE);
    expect(version.edl.segments.length).toBeGreaterThan(0);
    expect(version.edl.overlays).toContainEqual(expect.objectContaining({ kind: 'bauchbinde' }));
    expect(h.deps.decideDesign).not.toHaveBeenCalled();
    expect(h.deps.notify).toHaveBeenCalledWith(ROW, 'ready');
  });

  it('keeps the gemma cut when only the design gives up', async () => {
    const h = harness({
      decideCut: vi.fn(async () => ({
        unitIds: ['c1.s5', 'c1.s6'],
        omitted: { 'c1.s1': 'Vorgeplänkel' },
        rationale: 'Kurz und klar.',
        validation: { ok: true as const, timeline: { pieces: [], words: [], duration: 0 } },
      })),
    });
    await processClaimed(ROW, h.deps);
    const [version] = h.finished() ?? [];
    expect(version.edl.segments.map((s) => s.unitId)).toEqual(['c1.s5', 'c1.s6']);
    expect(version.omitted).toEqual({ 'c1.s1': 'Vorgeplänkel' });
    expect(version.rationale).toBe('Kurz und klar.');
  });

  it('stops without a plan once the project was cancelled', async () => {
    const h = harness({}, true);
    const error = await processClaimed(ROW, h.deps).catch((e: unknown) => e);
    await handleFailure(ROW, error, h.deps);
    expect(h.deps.analyzeClip).not.toHaveBeenCalled();
    expect(h.deps.notify).not.toHaveBeenCalled();
    expect(h.sql.some((s) => s.includes("SET status = 'failed'"))).toBe(false);
  });
});

describe('handleFailure', () => {
  it('fails at once when nothing is said, gives the trees back and tells the person', async () => {
    const h = harness({
      analyzeClip: vi.fn(async (_job, input) => ({ ...clip(input.id, input.role), words: [] })),
    });
    const error = await processClaimed(ROW, h.deps).catch((e: unknown) => e);
    await handleFailure(ROW, error, h.deps);
    expect(h.deps.releaseTrees).toHaveBeenCalledWith('user-1', 100, '2026-11-10');
    expect(h.deps.notify).toHaveBeenCalledWith(ROW, 'failed');
  });

  it('retries a passing error and gives up after the last attempt', async () => {
    const first = harness();
    await handleFailure(ROW, new Error('GreenPT 502'), first.deps);
    expect(first.sql.at(-1)).toContain('SET claim_at = NULL');
    expect(first.deps.releaseTrees).not.toHaveBeenCalled();

    const last = harness();
    await handleFailure({ ...ROW, attempts: 3 }, new Error('GreenPT 502'), last.deps);
    expect(last.sql.at(-1)).toContain("SET status = 'failed'");
    expect(last.deps.releaseTrees).toHaveBeenCalledTimes(1);
    expect(GENERIC_FAILURE).toContain('zurückgebucht');
  });
});
