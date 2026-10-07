import { describe, expect, it, vi } from 'vitest';

import { type ComposedSharepic } from '@gruenerator/canvas-editor/composer';
import { type SharepicSpec } from '@gruenerator/contracts';

import { reviseWithReview } from './sharepicRevisionLoop';

const specOf = (n: number) => ({ n }) as unknown as SharepicSpec;
const composedOf = (spec: SharepicSpec) => ({ spec }) as unknown as ComposedSharepic;

function setup(over: Partial<Parameters<typeof reviseWithReview>[0]['deps']> = {}) {
  const deps = {
    compose: vi.fn(async (spec: SharepicSpec) => composedOf(spec)),
    render: vi.fn(async () => ['p']),
    review: vi.fn(async () => ({ ok: false, issues: ['zu klein'], patch: [] })),
    applyPatch: vi.fn((spec: SharepicSpec) => specOf((spec as unknown as { n: number }).n + 1)),
    ...over,
  };
  const run = (signal?: AbortSignal) =>
    reviseWithReview({ spec: specOf(0), attributions: [], brief: 'b', deps, signal });
  return { deps, run };
}

describe('reviseWithReview', () => {
  it('stops after MAX_REVIEWS rounds and reports the issues', async () => {
    const { deps, run } = setup();
    const out = await run();
    expect(deps.review).toHaveBeenCalledTimes(2);
    expect(out?.spec).toEqual(specOf(2));
    expect(out?.hinweise).toEqual(['zu klein', 'zu klein']);
    expect(out?.previews).toEqual(['p']);
  });

  it('stops when the review is ok', async () => {
    const { deps, run } = setup({
      review: vi.fn(async () => ({ ok: true, issues: [], patch: [] })),
    });
    const out = await run();
    expect(deps.applyPatch).not.toHaveBeenCalled();
    expect(out?.spec).toEqual(specOf(0));
  });

  it('stops when the patch is a no-op (same object)', async () => {
    const { deps, run } = setup({ applyPatch: vi.fn((spec: SharepicSpec) => spec) });
    const out = await run();
    expect(deps.review).toHaveBeenCalledTimes(1);
    expect(deps.compose).toHaveBeenCalledTimes(1);
    expect(out?.spec).toEqual(specOf(0));
  });

  it('returns the current design when the review fails', async () => {
    const { run } = setup({ review: vi.fn(async () => null) });
    const out = await run();
    expect(out?.spec).toEqual(specOf(0));
    expect(out?.previews).toEqual(['p']);
  });

  it('skips the review when the first render failed', async () => {
    const { deps, run } = setup({ render: vi.fn(async () => null) });
    const out = await run();
    expect(deps.review).not.toHaveBeenCalled();
    expect(out?.previews).toBeNull();
  });

  it('returns null when aborted', async () => {
    const ctl = new AbortController();
    const { run } = setup({
      review: vi.fn(async () => {
        ctl.abort();
        return { ok: false, issues: [], patch: [] };
      }),
    });
    expect(await run(ctl.signal)).toBeNull();
  });
});
