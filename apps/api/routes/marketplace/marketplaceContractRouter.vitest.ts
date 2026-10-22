/**
 * Der Router reicht Person, Land und Plattform an den Dienst und übersetzt
 * dessen Ergebnis in Status: 404 für Unsichtbares, 409 für die volle
 * Bibliothek, 500 bei einem Wurf.
 */
import { marketplaceListQuerySchema } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Request } from 'express';

const m = vi.hoisted(() => ({
  listMarketplace: vi.fn(),
  getMarketplaceFrontpage: vi.fn(),
  getMarketplaceItem: vi.fn(),
  setLike: vi.fn(),
  setSaved: vi.fn(),
  buildMarketplaceContext: vi.fn((p: Record<string, unknown>) => ({ ctx: p })),
}));

vi.mock('../../services/marketplace/marketplaceService.js', () => ({
  listMarketplace: m.listMarketplace,
  getMarketplaceFrontpage: m.getMarketplaceFrontpage,
  getMarketplaceItem: m.getMarketplaceItem,
  setLike: m.setLike,
  setSaved: m.setSaved,
}));
vi.mock('../../services/marketplace/context.js', () => ({
  buildMarketplaceContext: m.buildMarketplaceContext,
}));

const { marketplaceContractRouter } = await import('./marketplaceContractRouter.js');

type Result = { status: number; body: unknown };
type Handler = (args: Record<string, unknown>) => Promise<Result>;
const call = (name: string, args: Record<string, unknown> = {}, locale = 'de-AT') =>
  (marketplaceContractRouter as unknown as Record<string, Handler>)[name]!({
    req: { user: { id: 'viewer', locale }, headers: {} } as unknown as Request,
    ...args,
  });

const params = { kind: 'agent', ref: 'gruenerator-presse' };

beforeEach(() => vi.clearAllMocks());

describe('list', () => {
  it('builds the context from the viewer and the requested platform', async () => {
    m.listMarketplace.mockResolvedValue({ sections: [] });
    const query = marketplaceListQuerySchema.parse({ kinds: 'agent', platform: 'mobile' });
    const res = await call('list', { query });
    expect(res).toEqual({ status: 200, body: { sections: [] } });
    expect(m.buildMarketplaceContext).toHaveBeenCalledWith({
      userId: 'viewer',
      locale: 'de-AT',
      platform: 'mobile',
    });
    expect(m.listMarketplace).toHaveBeenCalledWith(
      { ctx: { userId: 'viewer', locale: 'de-AT', platform: 'mobile' } },
      query
    );
  });

  it('passes a requested Landesverband on to the context', async () => {
    m.listMarketplace.mockResolvedValue({ sections: [] });
    const query = marketplaceListQuerySchema.parse({ kinds: 'agent', lv: 'berlin' });
    await call('list', { query });
    expect(m.buildMarketplaceContext).toHaveBeenCalledWith({
      userId: 'viewer',
      locale: 'de-AT',
      platform: 'web',
      lvId: 'berlin',
    });
  });

  it('500 when the service throws', async () => {
    m.listMarketplace.mockRejectedValue(new Error('db down'));
    const res = await call('list', { query: marketplaceListQuerySchema.parse({}) });
    expect(res.status).toBe(500);
  });
});

describe('frontpage', () => {
  it('builds the page in the viewer’s country and platform', async () => {
    const page = { featured: null, featureId: null, shelves: [], collections: [] };
    m.getMarketplaceFrontpage.mockResolvedValue(page);
    const res = await call('frontpage', { query: { platform: 'mobile' } });
    expect(res).toEqual({ status: 200, body: page });
    expect(m.getMarketplaceFrontpage).toHaveBeenCalledWith({
      ctx: { userId: 'viewer', locale: 'de-AT', platform: 'mobile' },
    });
  });

  it('500 when the service throws', async () => {
    m.getMarketplaceFrontpage.mockRejectedValue(new Error('db down'));
    const res = await call('frontpage', { query: { platform: 'web' } });
    expect(res.status).toBe(500);
  });
});

describe('get', () => {
  const query = { platform: 'mobile' };

  it('answers the item the viewer may see, in their platform’s context', async () => {
    const item = { kind: 'agent', ref: 'gruenerator-presse' };
    m.getMarketplaceItem.mockResolvedValue(item);
    const res = await call('get', { params, query });
    expect(res).toEqual({ status: 200, body: { item } });
    expect(m.getMarketplaceItem).toHaveBeenCalledWith(
      { ctx: { userId: 'viewer', locale: 'de-AT', platform: 'mobile' } },
      'agent',
      'gruenerator-presse'
    );
  });

  it('404 for what the viewer cannot see, 500 when the service throws', async () => {
    m.getMarketplaceItem.mockResolvedValue(null);
    expect((await call('get', { params, query })).status).toBe(404);
    m.getMarketplaceItem.mockRejectedValue(new Error('db down'));
    expect((await call('get', { params, query })).status).toBe(500);
  });
});

describe.each([
  ['like', m.setLike, true, { liked: true, likesCount: 3 }],
  ['unlike', m.setLike, false, { liked: false, likesCount: 2 }],
  ['save', m.setSaved, true, { saved: true }],
  ['unsave', m.setSaved, false, { saved: false }],
] as const)('%s', (name, fn, value, body) => {
  it('passes kind, ref and the target state through', async () => {
    fn.mockResolvedValue({ ok: true, value: body });
    const res = await call(name, { params });
    expect(res).toEqual({ status: 200, body });
    expect(fn).toHaveBeenCalledWith(
      expect.objectContaining({ ctx: expect.objectContaining({ userId: 'viewer' }) }),
      'agent',
      'gruenerator-presse',
      value
    );
  });
});

it.each(['like', 'save'])('%s: 404 when the item is not visible', async (name) => {
  (name === 'like' ? m.setLike : m.setSaved).mockResolvedValue({ ok: false, status: 404 });
  const res = await call(name, { params });
  expect(res.status).toBe(404);
});

it('save: 409 when „Meine Grüneratoren" is full', async () => {
  m.setSaved.mockResolvedValue({ ok: false, status: 409 });
  const res = await call('save', { params });
  expect(res.status).toBe(409);
});
