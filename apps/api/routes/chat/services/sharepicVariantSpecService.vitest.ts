import { type SharepicSpec } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { saveCreatorVariantSpec } from './sharepicVariantSpecService.js';

const queryMock = vi.fn();
vi.mock('../../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: queryMock }),
}));

const slide = (color: 'mint' | 'tanne') => ({
  background: { kind: 'farbe' as const, color },
  position: 'oben' as const,
  align: 'links' as const,
  items: [{ type: 'headline' as const, lines: ['Mehr Radwege'] }],
  logo: false,
});
const drafted: SharepicSpec = { locale: 'de-DE', slides: [slide('mint'), slide('mint')] };
const tweaked: SharepicSpec = {
  locale: 'de-DE',
  seitenzahl: 'bruch',
  slides: [slide('tanne'), slide('tanne')],
};

function message(variant: Record<string, unknown>) {
  return {
    id: 'msg-1',
    tool_results: {
      toolCalls: [{ toolName: 'sharepic', result: { variants: [variant] } }],
    },
  };
}
const creatorVariant = (extra: Record<string, unknown> = {}) => ({
  id: 'v1',
  canvasType: 'freeform',
  initialProps: { creatorSpec: drafted, attributions: [null, null] },
  pages: [
    { creatorSpec: drafted, attributions: [null, null], slide: 0 },
    { creatorSpec: drafted, attributions: [null, null], slide: 1 },
  ],
  ...extra,
});

/** The thread lookup, then the messages; the update is recorded. */
function respond(owned: boolean, rows: unknown[]) {
  queryMock.mockImplementation((sql?: string) => {
    if (!sql) return Promise.resolve([]);
    if (sql.includes('FROM chat_threads')) return Promise.resolve(owned ? [{ id: 't1' }] : []);
    if (sql.includes('FROM chat_messages')) return Promise.resolve(rows);
    return Promise.resolve([]);
  });
}
const update = () => queryMock.mock.calls.find(([sql]) => String(sql).startsWith('UPDATE'));

beforeEach(() => queryMock.mockReset());

describe('saveCreatorVariantSpec', () => {
  it('stores the variation on the variant and on every page', async () => {
    respond(true, [message(creatorVariant())]);
    expect(await saveCreatorVariantSpec('t1', 'u1', 'v1', tweaked)).toBe('saved');
    const [, [id, json]] = update()!;
    expect(id).toBe('msg-1');
    type Stored = {
      initialProps: { creatorSpec: unknown; attributions: unknown };
      pages: { creatorSpec: unknown; slide: number }[];
    };
    const meta = JSON.parse(json as string) as {
      toolCalls: { result: { variants: Stored[] } }[];
    };
    const stored = meta.toolCalls[0]!.result.variants[0]!;
    expect(stored.initialProps.creatorSpec).toEqual(tweaked);
    expect(stored.initialProps.attributions).toEqual([null, null]);
    expect(stored.pages.map((p) => p.slide)).toEqual([0, 1]);
    expect(stored.pages[0]!.creatorSpec).toEqual(tweaked);
    expect(stored.pages[1]!.creatorSpec).toEqual(tweaked);
  });

  it("does not touch someone else's thread", async () => {
    respond(false, [message(creatorVariant())]);
    expect(await saveCreatorVariantSpec('t1', 'u2', 'v1', tweaked)).toBe('not-found');
    expect(update()).toBeUndefined();
  });

  it('refuses a variant opened in the editor, and one whose slides would change', async () => {
    respond(true, [message(creatorVariant({ canvasId: 'c1' }))]);
    expect(await saveCreatorVariantSpec('t1', 'u1', 'v1', tweaked)).toBe('conflict');
    respond(true, [message(creatorVariant())]);
    const fewer: SharepicSpec = { ...tweaked, slides: [slide('tanne')] };
    expect(await saveCreatorVariantSpec('t1', 'u1', 'v1', fewer)).toBe('conflict');
    expect(update()).toBeUndefined();
  });

  it('refuses a template sharepic from before the creator', async () => {
    respond(true, [message({ id: 'v1', canvasType: 'dreizeilen', initialProps: { line1: 'x' } })]);
    expect(await saveCreatorVariantSpec('t1', 'u1', 'v1', tweaked)).toBe('conflict');
  });

  it('reports an unknown variant', async () => {
    respond(true, [message(creatorVariant())]);
    expect(await saveCreatorVariantSpec('t1', 'u1', 'v9', tweaked)).toBe('not-found');
  });
});
