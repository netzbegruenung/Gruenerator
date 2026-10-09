import { beforeEach, describe, expect, it, vi } from 'vitest';

const repo = vi.hoisted(() => ({
  getOwnPodcast: vi.fn(),
  insertPodcast: vi.fn(),
  requeueFailedPodcast: vi.fn(),
  trashPodcast: vi.fn(),
  podcastVoices: vi.fn(() => ({ a: '1930', b: '1885' })),
}));
const budget = vi.hoisted(() => ({ status: vi.fn() }));

vi.mock('../../services/podcasts/podcastRepository.js', () => repo);
vi.mock('../../services/trees/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/trees/index.js')>()),
  getTreeBudget: () => budget,
}));

import { podcastsContractRouter } from './podcastsContractRouter.js';

type Handler = (args: Record<string, unknown>) => Promise<{ status: number; body: unknown }>;
const router = podcastsContractRouter as unknown as Record<
  'create' | 'get' | 'retry' | 'remove',
  Handler
>;

const req = { user: { id: 'u1', tts_voice_id: '1930' }, headers: {} };
const balance = (remainingUnits: number | null) => ({
  usedUnits: 0,
  limitUnits: remainingUnits === null ? null : 1000,
  remainingUnits,
  resetsAt: new Date('2026-10-11T00:00:00Z'),
  newsletterBonus: false,
  day: '2026-10-10',
});

beforeEach(() => vi.clearAllMocks());

describe('create', () => {
  it('queues the podcast and answers 202 with its id', async () => {
    budget.status.mockResolvedValue(balance(1000));
    repo.insertPodcast.mockResolvedValue({ id: 'p1', slugSuffix: 'kxq7pm' });
    const res = await router.create({ req, body: { text: 'x'.repeat(100), title: 'Titel' } });
    expect(res).toEqual({ status: 202, body: { id: 'p1', slugSuffix: 'kxq7pm' } });
    expect(repo.insertPodcast).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', title: 'Titel', voices: { a: '1930', b: '1885' } })
    );
  });

  it('refuses with 429 before queueing when not even a short podcast fits', async () => {
    budget.status.mockResolvedValue(balance(10));
    const res = await router.create({ req, body: { text: 'x'.repeat(100) } });
    expect(res.status).toBe(429);
    expect(repo.insertPodcast).not.toHaveBeenCalled();
  });

  it('never refuses on an unlimited instance', async () => {
    budget.status.mockResolvedValue(balance(null));
    repo.insertPodcast.mockResolvedValue({ id: 'p2', slugSuffix: 'hjw9tz' });
    const res = await router.create({ req, body: { text: 'x'.repeat(100) } });
    expect(res.status).toBe(202);
  });
});

describe('get / retry', () => {
  it('answers 404 for a podcast that is not the requester’s', async () => {
    repo.getOwnPodcast.mockResolvedValue(null);
    const res = await router.get({ req, params: { ref: 'kxq7pm' } });
    expect(res.status).toBe(404);
  });

  it('answers 409 when retrying a podcast that did not fail', async () => {
    repo.requeueFailedPodcast.mockResolvedValue(false);
    repo.getOwnPodcast.mockResolvedValue({ id: 'p1' });
    const res = await router.retry({ req, params: { id: 'p1' } });
    expect(res.status).toBe(409);
  });

  it('moves an own podcast to the Papierkorb and hides someone else’s', async () => {
    repo.trashPodcast.mockResolvedValueOnce('ok').mockResolvedValueOnce('forbidden');
    expect((await router.remove({ req, params: { id: 'p1' } })).status).toBe(200);
    expect((await router.remove({ req, params: { id: 'p2' } })).status).toBe(404);
  });
});
