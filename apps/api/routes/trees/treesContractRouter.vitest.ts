/**
 * The response mapping of the one handler: a `TreeBalance` from the service
 * becomes the contract's `treeBudgetStatusSchema` shape, and a thrown error
 * becomes 500. Handlers are called directly; auth is a prefix concern.
 */
import { treeBudgetStatusSchema } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('../../utils/contractValidationLogger.js', () => ({
  logContractValidationError: () => () => {},
}));

const status = vi.fn();
vi.mock('../../services/trees/index.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getTreeBudget: () => ({ status }),
}));

const { treesContractRouter } = await import('./treesContractRouter.js');

type Handler = (args: Record<string, unknown>) => Promise<{ status: number; body: unknown }>;
const router = treesContractRouter as unknown as Record<string, Handler>;

const req = { user: { id: 'user-1' } };
const resetsAt = new Date('2026-09-19T00:00:00.000Z');

beforeEach(() => {
  status.mockReset();
});

describe('treesContract.getMyTrees', () => {
  it('maps a metered balance to the contract shape', async () => {
    status.mockResolvedValue({
      usedUnits: 300,
      limitUnits: 1000,
      remainingUnits: 700,
      resetsAt,
      newsletterBonus: false,
    });

    const res = await router.getMyTrees({ req });

    expect(res.status).toBe(200);
    const body = treeBudgetStatusSchema.parse(res.body);
    expect(body).toEqual({
      used: 3,
      limit: 10,
      remaining: 7,
      resetsAt: resetsAt.toISOString(),
      newsletterBonus: false,
    });
  });

  it('passes an unlimited instance through as null limit/remaining', async () => {
    status.mockResolvedValue({
      usedUnits: 0,
      limitUnits: null,
      remainingUnits: null,
      resetsAt,
      newsletterBonus: false,
    });

    const res = await router.getMyTrees({ req });

    expect(res.status).toBe(200);
    const body = treeBudgetStatusSchema.parse(res.body);
    expect(body.limit).toBeNull();
    expect(body.remaining).toBeNull();
  });

  it('answers 500 when the service throws unexpectedly', async () => {
    status.mockRejectedValue(new Error('boom'));

    const res = await router.getMyTrees({ req });

    expect(res.status).toBe(500);
    expect((res.body as { error: string }).error).toBe('boom');
  });
});
