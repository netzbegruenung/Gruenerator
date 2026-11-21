import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useChatConfigStore } from '../../stores/chatConfigStore';
import { useSharepicReviewStore } from '../../stores/sharepicReviewStore';

import { parseSSEStream } from './parseSSEStream';

// A creator variant is anything with a spec here; the spec's own schema is the contracts' business.
vi.mock('@gruenerator/contracts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@gruenerator/contracts')>()),
  parseSharepicChatProps: (value: { creatorSpec?: unknown } | null) =>
    value?.creatorSpec ? value : null,
}));

vi.mock('../../lib/notify', () => ({ notifyWarning: vi.fn(), notifyError: vi.fn() }));

function sseResponse(events: Array<{ event: string; data: unknown }>): Response {
  return new Response(
    events.map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('')
  );
}

async function drain(
  events: Array<{ event: string; data: unknown }>,
  effectsFrom = 0
): Promise<void> {
  const outcome = { interrupted: false, indexedDocumentIds: [] as string[] };
  for await (const _ of parseSSEStream(sseResponse(events), {}, outcome, undefined, {
    effectsFrom,
  })) {
    // drain
  }
}

const VARIANT = {
  id: 'v1',
  canvasType: 'freeform',
  initialProps: { creatorSpec: { slides: [{ items: [] }] }, attributions: [] },
};
const REVIEW = { brief: 'Sharepic zur Verkehrswende', mode: 'draft' };
const complete = (extra: Record<string, unknown> = {}) => ({
  event: 'sharepic_complete',
  data: { message: 'Sharepic entworfen', variants: [VARIANT], review: REVIEW, ...extra },
});
const done = (threadId: string | null) => ({
  event: 'done',
  data: threadId ? { threadId } : {},
});

const reviewSharepic = vi.fn();

beforeEach(() => {
  reviewSharepic.mockReset();
  useSharepicReviewStore.setState({ checking: {}, reviewed: {} });
  useChatConfigStore.setState({ reviewSharepic });
});

describe('browser review of chat sharepics', () => {
  it('reviews a fresh creator sharepic once the turn names its thread', async () => {
    const corrected = { ...VARIANT.initialProps, creatorSpec: { slides: [{ items: [1] }] } };
    let finish: (props: unknown) => void = () => {};
    reviewSharepic.mockReturnValue(new Promise((resolve) => (finish = resolve)));

    await drain([complete(), done('t1')]);

    expect(reviewSharepic).toHaveBeenCalledWith({
      threadId: 't1',
      variantId: 'v1',
      initialProps: VARIANT.initialProps,
      review: REVIEW,
    });
    expect(useSharepicReviewStore.getState().checking).toEqual({ v1: true });
    finish(corrected);
    await vi.waitFor(() =>
      expect(useSharepicReviewStore.getState().reviewed).toEqual({ v1: corrected })
    );
    expect(useSharepicReviewStore.getState().checking).toEqual({});
  });

  it('keeps the draft when the review changes nothing', async () => {
    reviewSharepic.mockResolvedValue(null);
    await drain([complete(), done('t1')]);
    await vi.waitFor(() => expect(useSharepicReviewStore.getState().checking).toEqual({}));
    expect(useSharepicReviewStore.getState().reviewed).toEqual({});
  });

  it('leaves alone what it must not review', async () => {
    // No hint (an old server), no thread, a replayed turn, a canvas, a template variant.
    await drain([complete({ review: undefined }), done('t1')]);
    await drain([complete(), done(null)]);
    await drain([complete(), done('t1')], Infinity);
    await drain([complete({ variants: [{ ...VARIANT, canvasId: 'c1' }] }), done('t1')]);
    await drain([complete({ variants: [{ ...VARIANT, initialProps: {} }] }), done('t1')]);
    expect(reviewSharepic).not.toHaveBeenCalled();
  });

  it('does nothing on a host without a reviewer', async () => {
    useChatConfigStore.setState({ reviewSharepic: undefined });
    await drain([complete(), done('t1')]);
    expect(useSharepicReviewStore.getState().checking).toEqual({});
  });
});
