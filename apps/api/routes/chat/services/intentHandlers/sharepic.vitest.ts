import { type SharepicSpec, type SharepicVariant } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DraftFailedError } from '../../../../services/sharepicCreator/draftAgent.js';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  revise: vi.fn(),
  legacy: vi.fn(),
  last: vi.fn(),
}));

vi.mock('../sharepicCreatorVariant.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sharepicCreatorVariant.js')>()),
  createCreatorSharepic: mocks.create,
  reviseCreatorSharepic: mocks.revise,
}));
vi.mock('../sharepicVariantHelpers.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sharepicVariantHelpers.js')>()),
  generateSharepicVariants: mocks.legacy,
  getLastSharepicVariant: mocks.last,
}));
vi.mock('../artifactGeneration.js', () => ({
  resolveSharepicAuthorName: () => Promise.resolve(''),
}));
vi.mock('../threadPersistenceService.js', () => ({
  getRecentThreadSources: () => Promise.resolve([]),
}));

import { runSharepicGeneration } from './sharepic.js';

import type { ChatGraphState } from '../../../../agents/langgraph/ChatGraph/types.js';
import type { SSEWriter } from '../sseHelpers.js';
import type { PriorSharepic } from '../sharepicVariantHelpers.js';
import type { Request } from 'express';

const SPEC: SharepicSpec = {
  locale: 'de-DE',
  slides: [
    {
      background: { kind: 'farbe', color: 'tanne' },
      position: 'mitte',
      align: 'links',
      items: [{ type: 'headline', lines: ['Busse statt Stau'] }],
      logo: false,
    },
  ],
};

const CREATOR_PRIOR: PriorSharepic = {
  variantId: 'v1',
  canvasType: 'freeform',
  props: { creatorSpec: SPEC, attributions: [null] },
  canvasId: null,
};
const LEGACY_PRIOR: PriorSharepic = {
  variantId: 'v0',
  canvasType: 'dreizeilen',
  props: { line1: 'Mehr', line2: 'Radwege', line3: 'jetzt' },
  canvasId: null,
};
const DRAFT: SharepicVariant = {
  id: 'new',
  canvasType: 'freeform',
  initialProps: { creatorSpec: SPEC, attributions: [null] },
};

function state(text: string): ChatGraphState {
  return { messages: [{ role: 'user', content: text }], userLocale: 'de-DE' } as never;
}

function run(text: string, refinement?: { instruction: string; prior: PriorSharepic }) {
  const send = vi.fn();
  const done = runSharepicGeneration({
    state: state(text),
    sse: { send } as unknown as SSEWriter,
    req: {} as Request,
    threadId: 't1',
    ...(refinement && { sharepicRefinement: refinement }),
  });
  return { send, done };
}

describe('runSharepicGeneration', () => {
  beforeEach(() => {
    for (const m of Object.values(mocks)) m.mockReset();
    mocks.create.mockResolvedValue(DRAFT);
    mocks.revise.mockResolvedValue(DRAFT);
  });

  it('refines a legacy template sharepic with the template variants', async () => {
    mocks.legacy.mockResolvedValue({ variants: [DRAFT], declinedReason: null });
    const { done } = run('kürzer', { instruction: 'kürzer', prior: LEGACY_PRIOR });
    expect(await done).toEqual([DRAFT]);
    expect(mocks.legacy).toHaveBeenCalledWith(
      expect.objectContaining({ refinement: { instruction: 'kürzer', prior: LEGACY_PRIOR } })
    );
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.revise).not.toHaveBeenCalled();
  });

  it('revises a creator sharepic from its spec', async () => {
    const { send, done } = run('Headline kürzer', {
      instruction: 'Headline kürzer',
      prior: CREATOR_PRIOR,
    });
    expect(await done).toEqual([DRAFT]);
    expect(mocks.revise).toHaveBeenCalledWith({
      instruction: 'Headline kürzer',
      prior: CREATOR_PRIOR,
      spec: SPEC,
      userId: null,
    });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith('sharepic_complete', {
      message: 'Sharepic entworfen',
      variants: [DRAFT],
    });
  });

  it('drafts an alternative that avoids the prior layout', async () => {
    const { done } = run('mach eine ganz andere Variante', {
      instruction: 'mach eine ganz andere Variante',
      prior: CREATOR_PRIOR,
    });
    await done;
    expect(mocks.revise).not.toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        avoid: SPEC,
        brief: expect.stringContaining('Busse statt Stau') as unknown,
      })
    );
  });

  it('drafts a fresh sharepic with nothing to avoid', async () => {
    const { done } = run('Sharepic über Busse auf dem Land');
    await done;
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ avoid: null, locale: 'de-DE' })
    );
    expect(mocks.last).not.toHaveBeenCalled();
  });

  it('puts the draft-failed hint where the client shows it', async () => {
    mocks.revise.mockRejectedValue(new DraftFailedError('no valid spec'));
    const { send, done } = run('Headline kürzer', {
      instruction: 'Headline kürzer',
      prior: CREATOR_PRIOR,
    });
    expect(await done).toEqual([]);
    expect(send).toHaveBeenCalledWith(
      'sharepic_complete',
      expect.objectContaining({
        variants: [],
        message: expect.stringContaining('Formuliere die Änderung etwas genauer') as unknown,
      })
    );
  });

  it('asks for a clearer order when a fresh draft fails', async () => {
    mocks.create.mockRejectedValue(new DraftFailedError('no valid spec'));
    const { send, done } = run('Sharepic über Busse auf dem Land');
    expect(await done).toEqual([]);
    expect(send).toHaveBeenCalledWith(
      'sharepic_complete',
      expect.objectContaining({
        variants: [],
        message: expect.stringContaining('Formuliere den Auftrag etwas genauer') as unknown,
      })
    );
  });
});
