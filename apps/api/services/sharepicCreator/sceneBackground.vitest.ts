import { afterEach, describe, expect, it, vi } from 'vitest';

const { log, generateFromPrompt, release } = vi.hoisted(() => ({
  log: { info: vi.fn(), warn: vi.fn() },
  generateFromPrompt: vi.fn(),
  release: vi.fn(),
}));

vi.mock('../../utils/logger.js', () => ({ createLogger: () => log }));
vi.mock('../flux/index.js', () => ({
  FluxImageService: { create: vi.fn(async () => ({ generateFromPrompt })) },
}));
vi.mock('../sharedMediaService.js', () => ({
  getSharedMediaService: () => ({ uploadMediaFile: vi.fn(async () => ({ shareToken: 't' })) }),
}));
vi.mock('../trees/index.js', () => ({
  getTreeBudget: () => ({
    reserve: vi.fn(async () => ({ ok: true, status: { day: 'd' } })),
    release,
  }),
  treeBudgetSpentMessage: () => '',
  treeCostForImage: () => 100,
}));
vi.mock('node:fs', () => ({ default: { readFileSync: () => Buffer.from('') } }));

import { createScenePainter } from './sceneBackground.js';

const scene = { motiv: 'a forest', textSeite: 'unten', format: 'post-portrait' } as const;

describe('createScenePainter', () => {
  afterEach(() => vi.clearAllMocks());

  it('logs how long a painted scene took, so a deadline can come from measurements', async () => {
    generateFromPrompt.mockResolvedValue({ stored: { filePath: 'f' } });
    expect(await createScenePainter('u')(scene)).toEqual({ ok: true, ref: 'ki:t' });
    expect(log.info).toHaveBeenCalledWith(expect.stringMatching(/^scene painted in \d+ s$/));
  });

  it('logs how long a failed scene took and releases the trees', async () => {
    generateFromPrompt.mockRejectedValue(
      new Error('Polling timed out after 120 seconds (last status: Pending)')
    );
    expect((await createScenePainter('u')(scene)).ok).toBe(false);
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringMatching(
        /^scene failed after \d+ s: Polling timed out after 120 seconds \(last status: Pending\)$/
      )
    );
    expect(release).toHaveBeenCalledOnce();
  });
});
