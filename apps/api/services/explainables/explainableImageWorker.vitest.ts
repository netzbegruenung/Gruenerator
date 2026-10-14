import { type ExplainableContent } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../database/services/PostgresService.js', () => ({ getPostgresInstance: () => ({}) }));
vi.mock('../../routes/sharepic/sharepic_canvas/imagine_label_canvas.js', () => ({
  applyKiLabel: vi.fn(),
}));
vi.mock('../flux/index.js', () => ({ FluxImageService: { create: vi.fn() } }));
vi.mock('../../utils/reportBackgroundError.js', () => ({ reportBackgroundError: vi.fn() }));

const {
  CLAIM_SQL,
  FINISH_SQL,
  GIVE_UP_SQL,
  MARK_DONE_SQL,
  MARK_FAILED_SQL,
  MAX_ATTEMPTS,
  TAKE_UNITS_SQL,
  buildImagePrompt,
  drainExplainableImages,
  STYLE_PREFIX,
} = await import('./explainableImageWorker.js');

const UNITS = 50;
const DAY = '2026-10-09';

function content(statuses: Array<'pending' | 'done' | 'failed' | null>): ExplainableContent {
  return {
    title: 'T',
    summary: 'S',
    sections: statuses.map((status, i) => ({
      heading: `H${i}`,
      paragraphs: ['p'],
      ...(status && { image: { prompt: `prompt ${i} for a drawing`, alt: 'Alt', status } }),
    })),
    keyTakeaways: ['a', 'b'],
    sources: [],
  };
}

/** A fake db answering by statement; `reserved` mimics the row's reserved_units. */
function fakeDeps(opts: {
  claim: ExplainableContent | null;
  reserved: number;
  giveUp?: Array<{ id: string; user_id: string; reserved_units: number; reserved_day: string }>;
  failSections?: number[];
}) {
  let reserved = opts.reserved;
  let claimed = false;
  const giveUp = [...(opts.giveUp ?? [])];
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (sql === GIVE_UP_SQL) return giveUp.splice(0, 1);
    if (sql === CLAIM_SQL) {
      if (claimed || !opts.claim) return [];
      claimed = true;
      return [{ id: 'e1', user_id: 'u1', content: opts.claim }];
    }
    if (sql === MARK_DONE_SQL) {
      reserved = Math.max(reserved - (params[2] as number), 0);
      return [];
    }
    if (sql === TAKE_UNITS_SQL) {
      const units = params[1] as number;
      if (reserved < units) return [];
      reserved -= units;
      return [{ reserved_day: DAY }];
    }
    return [];
  });
  const fail = new Set(opts.failSections ?? []);
  const generateImage = vi.fn(async (prompt: string) => {
    const n = Number(/prompt (\d+)/.exec(prompt)?.[1]);
    if (fail.has(n)) throw new Error('flux down');
    return Buffer.from('png');
  });
  const deps = {
    db: { query: query as never },
    release: vi.fn(async () => ({})),
    generateImage,
    writeImage: vi.fn(async (_id: string, _n: number, _png: Buffer) => {}),
    unitsPerImage: UNITS,
  };
  return { deps, calls, reservedNow: () => reserved };
}

beforeEach(() => vi.clearAllMocks());

describe('drainExplainableImages', () => {
  it('draws pending images in order, skips drawn ones, and finishes the row', async () => {
    const { deps, calls } = fakeDeps({
      claim: content(['pending', 'done', null, 'pending']),
      reserved: 2 * UNITS,
    });

    await drainExplainableImages(deps);

    expect(deps.generateImage.mock.calls.map((c) => c[0])).toEqual([
      'prompt 0 for a drawing',
      'prompt 3 for a drawing',
    ]);
    expect(deps.writeImage.mock.calls.map((c) => c[1])).toEqual([0, 3]);
    const done = calls.filter((c) => c.sql === MARK_DONE_SQL).map((c) => c.params[1]);
    expect(done).toEqual(['0', '3']);
    expect(deps.release).not.toHaveBeenCalled();
    expect(calls.filter((c) => c.sql === FINISH_SQL).map((c) => c.params)).toEqual([['e1']]);
  });

  it('a failed image is marked failed, its units released, the rest still drawn', async () => {
    const { deps, calls, reservedNow } = fakeDeps({
      claim: content(['pending', 'pending', 'pending']),
      reserved: 3 * UNITS,
      failSections: [1],
    });

    await drainExplainableImages(deps);

    expect(calls.filter((c) => c.sql === MARK_FAILED_SQL).map((c) => c.params[1])).toEqual(['1']);
    expect(calls.filter((c) => c.sql === MARK_DONE_SQL).map((c) => c.params[1])).toEqual([
      '0',
      '2',
    ]);
    expect(deps.release).toHaveBeenCalledTimes(1);
    expect(deps.release).toHaveBeenCalledWith('u1', UNITS, DAY);
    expect(reservedNow()).toBe(0);
    expect(calls.filter((c) => c.sql === FINISH_SQL).map((c) => c.params)).toEqual([['e1']]);
  });

  it('releases nothing for a failed image whose units a trash already gave back', async () => {
    const { deps } = fakeDeps({ claim: content(['pending']), reserved: 0, failSections: [0] });

    await drainExplainableImages(deps);

    expect(deps.release).not.toHaveBeenCalled();
  });

  it('gives up rows out of attempts and releases what they still hold', async () => {
    const { deps, calls } = fakeDeps({
      claim: null,
      reserved: 0,
      giveUp: [{ id: 'e9', user_id: 'u9', reserved_units: 2 * UNITS, reserved_day: DAY }],
    });

    await drainExplainableImages(deps);

    expect(calls.find((c) => c.sql === GIVE_UP_SQL)?.params[0]).toBe(MAX_ATTEMPTS);
    expect(deps.release).toHaveBeenCalledWith('u9', 2 * UNITS, DAY);
    expect(deps.generateImage).not.toHaveBeenCalled();
  });

  it('claims only live, unexhausted, unclaimed-or-stale rows', () => {
    expect(CLAIM_SQL).toContain('deleted_at IS NULL');
    expect(CLAIM_SQL).toContain('attempts < $1');
    expect(CLAIM_SQL).toContain('FOR UPDATE SKIP LOCKED');
    expect(CLAIM_SQL).toContain('attempts = e.attempts + 1');
    expect(GIVE_UP_SQL).toContain('attempts >= $1');
  });
});

describe('buildImagePrompt', () => {
  it('prefixes the style and caps the length', () => {
    expect(buildImagePrompt('a cat')).toBe(`${STYLE_PREFIX}a cat`);
    expect(buildImagePrompt('x'.repeat(2000)).length).toBe(900);
  });
});
