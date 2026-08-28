/**
 * `count` and `limit` on the share list endpoints.
 *
 * The field has twice been an account-wide number sitting next to a list that
 * is filtered three ways — by `type`, by `status`, and by both provenance
 * columns `creationFeedWhere` applies. First it was `SELECT COUNT(*) FROM
 * shared_media WHERE user_id = $1` with no filter at all; then #2987 replaced
 * that with the Mediathek quota, which is unfiltered for a different and
 * deliberate reason. Either way the number did not describe the list shipped
 * beside it, and the gap grew with the account: one non-library thumbnail row
 * per canvas document (#2986).
 *
 * These tests pin the narrow reading — `count` is this page — by asserting it
 * against a service that returns *fewer* rows than the account holds, which is
 * exactly the situation both old implementations got wrong.
 */
import { mySharesQuerySchema } from '@gruenerator/contracts';
import { describe, expect, it, vi } from 'vitest';

import { USER_SHARES_MAX_LIMIT } from '../../services/sharedMediaFilters.js';

import type { SharedMediaRow } from '../../types/media.js';
import type { Request } from 'express';

const getUserShares = vi.fn<() => Promise<SharedMediaRow[]>>();
/** Present so a test can prove the handler does NOT reach for the quota. */
const getLibraryUsage = vi.fn(() =>
  Promise.resolve({ count: 87, limit: 100, isFull: false, isNearlyFull: false })
);

vi.mock('./shareServices.js', () => ({
  getSharedMediaService: () => Promise.resolve({ getUserShares, getLibraryUsage }),
}));

const { shareReadContractRouter } = await import('./shareReadContractRouter.js');

function row(id: string): SharedMediaRow {
  return {
    id,
    share_token: `tok-${id}`,
    media_type: 'image',
    title: null,
    thumbnail_path: null,
    file_size: null,
    duration: null,
    image_type: null,
    image_metadata: {},
    status: 'ready',
    download_count: 0,
    created_at: new Date('2026-08-28T00:00:00Z'),
  } as unknown as SharedMediaRow;
}

const req = { user: { id: 'user-1' } } as unknown as Request;

describe('listMyShares', () => {
  it('counts the list it returns, not the account', async () => {
    getUserShares.mockResolvedValue([row('a'), row('b')]);

    const res = await shareReadContractRouter.listMyShares({
      req,
      query: { type: 'image' },
    } as never);

    expect(res.status).toBe(200);
    const body = res.body as { shares: unknown[]; count: number; limit: number };
    expect(body.count).toBe(body.shares.length);
    expect(body.count).toBe(2);
    // 87 is what the account holds. Reporting it here is the bug.
    expect(body.count).not.toBe(87);
  });

  it('does not ask for the quota at all', async () => {
    getUserShares.mockResolvedValue([]);
    getLibraryUsage.mockClear();

    await shareReadContractRouter.listMyShares({ req, query: {} } as never);

    expect(getLibraryUsage).not.toHaveBeenCalled();
  });

  it('reports the row ceiling that actually bounds the query', async () => {
    getUserShares.mockResolvedValue([row('a')]);

    const res = await shareReadContractRouter.listMyShares({ req, query: {} } as never);

    expect((res.body as { limit: number }).limit).toBe(USER_SHARES_MAX_LIMIT);
  });

  it('answers 401 without a session', async () => {
    const res = await shareReadContractRouter.listMyShares({
      req: {} as unknown as Request,
      query: {},
    } as never);

    expect(res.status).toBe(401);
  });
});

describe('recentShares', () => {
  it('counts the page it hands out, not everything it fetched', async () => {
    getUserShares.mockResolvedValue(Array.from({ length: 12 }, (_, i) => row(String(i))));

    const res = await shareReadContractRouter.recentShares({
      req,
      query: { limit: '5' },
    } as never);

    const body = res.body as { shares: unknown[]; count: number; limit: number };
    expect(body.shares).toHaveLength(5);
    expect(body.count).toBe(5);
    expect(body.limit).toBe(5);
  });
});

/**
 * The request side of the same endpoint (#3008).
 *
 * `type` and `status` were `z.string().optional()`, so `?status=bogus` reached
 * Postgres as a literal and came back as an empty list — a closed set stated in
 * four places and enforced in none. Query validation is live on this router
 * (`createExpressEndpoints(..., { requestValidationErrorHandler })`), so the
 * schema is what rejects it; these tests pin both halves of that, including the
 * empty-string carve-out that keeps `?type=` a no-op rather than a 400.
 */
describe('mySharesQuerySchema', () => {
  it('accepts every value the column can hold', () => {
    // Both sets are the CHECK constraints in schema.sql, not a guess.
    for (const type of ['image', 'video', 'transfer'] as const) {
      expect(mySharesQuerySchema.safeParse({ type }).success).toBe(true);
    }
    for (const status of ['processing', 'ready', 'failed', 'draft'] as const) {
      expect(mySharesQuerySchema.safeParse({ status }).success).toBe(true);
    }
  });

  /**
   * `'transfer'` is a live third media type — `transferService.createTransfer`
   * writes into `shared_media` and sets neither provenance column, so those
   * rows survive `creationFeedWhere` and `?type=transfer` selected them. Typing
   * the filter against the two-value `shareMediaTypeSchema` (what a *created*
   * share is) would have made that request a 400.
   */
  it('does not mistake the creation type for the stored one', () => {
    expect(mySharesQuerySchema.safeParse({ type: 'transfer' }).success).toBe(true);
  });

  it('rejects a value outside the set instead of querying for it', () => {
    expect(mySharesQuerySchema.safeParse({ type: 'gif' }).success).toBe(false);
    expect(mySharesQuerySchema.safeParse({ status: 'bogus' }).success).toBe(false);
  });

  it('still treats an empty param as no filter', () => {
    const parsed = mySharesQuerySchema.safeParse({ type: '', status: '' });

    expect(parsed.success).toBe(true);
    // The handler's `query.type || null` collapses '' exactly like undefined.
    expect(parsed.success && (parsed.data.type || null)).toBeNull();
    expect(parsed.success && (parsed.data.status || null)).toBeNull();
  });

  it('leaves both filters optional', () => {
    expect(mySharesQuerySchema.safeParse({}).success).toBe(true);
  });
});
