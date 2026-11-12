import { type SharepicSpec } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.hoisted(() => vi.fn());
vi.mock('../../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query }),
}));
vi.mock('sharp', () => ({ default: () => ({}) }));

import { saveReviewedCreatorSpec } from './sharepicEditService.js';

const slide = (lines: string[]): SharepicSpec['slides'][number] => ({
  background: { kind: 'farbe', color: 'tanne' },
  position: 'mitte',
  align: 'links',
  items: [{ type: 'headline', lines }],
  logo: false,
});
const DRAFT: SharepicSpec = { locale: 'de-DE', slides: [slide(['Ein viel zu langer Satz'])] };
const REVIEWED: SharepicSpec = { locale: 'de-DE', slides: [slide(['Bus für alle'])] };

function messageWith(variant: Record<string, unknown>) {
  return {
    id: 'm1',
    tool_results: {
      toolCalls: [{ toolName: 'sharepic', result: { variants: [variant] } }],
    },
  };
}

const VARIANT = {
  id: 'v1',
  canvasType: 'freeform',
  initialProps: { creatorSpec: DRAFT, attributions: [null] },
  label: 'Sharepic',
};

/** First query lists the thread's messages, the second reads the one to update. */
function rows(variant: Record<string, unknown>) {
  const row = messageWith(variant);
  query.mockResolvedValueOnce([row]).mockResolvedValueOnce([row]).mockResolvedValue([]);
}

function written(): { toolCalls: Array<{ result: { variants: Array<Record<string, unknown>> } }> } {
  const update = query.mock.calls.find(([sql]) => String(sql).startsWith('UPDATE'));
  return JSON.parse(String(update![1][1])) as ReturnType<typeof written>;
}

beforeEach(() => query.mockReset());

describe('saveReviewedCreatorSpec', () => {
  it('replaces the spec of the persisted variant', async () => {
    rows(VARIANT);
    expect(await saveReviewedCreatorSpec('t1', 'v1', REVIEWED)).toBe('saved');
    const variant = written().toolCalls[0]!.result.variants[0]!;
    expect(variant.initialProps).toEqual({ creatorSpec: REVIEWED, attributions: [null] });
    expect(variant.altText).toBe('Bus für alle');
    expect(variant.pages).toBeUndefined();
  });

  it('gives a carousel one page per slide', async () => {
    const carousel = { ...REVIEWED, slides: [slide(['Eins']), slide(['Zwei'])] };
    rows({
      ...VARIANT,
      initialProps: { creatorSpec: { ...DRAFT, slides: carousel.slides }, attributions: [] },
    });
    expect(await saveReviewedCreatorSpec('t1', 'v1', carousel)).toBe('saved');
    const pages = written().toolCalls[0]!.result.variants[0]!.pages as Array<{ slide: number }>;
    expect(pages.map((p) => p.slide)).toEqual([0, 1]);
  });

  it('leaves a variant that is already a canvas alone', async () => {
    rows({ ...VARIANT, canvasId: 'c1' });
    expect(await saveReviewedCreatorSpec('t1', 'v1', REVIEWED)).toBe('minted');
    expect(query.mock.calls.some(([sql]) => String(sql).startsWith('UPDATE'))).toBe(false);
  });

  it('refuses a correction that changes the design', async () => {
    rows(VARIANT);
    expect(await saveReviewedCreatorSpec('t1', 'v1', { ...REVIEWED, locale: 'de-AT' })).toBe(
      'design_changed'
    );
  });

  it('says not_found before the turn is persisted', async () => {
    query.mockResolvedValue([]);
    expect(await saveReviewedCreatorSpec('t1', 'v1', REVIEWED)).toBe('not_found');
  });
});
