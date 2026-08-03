/**
 * The CRUD handlers for /api/auth/letterheads.
 *
 * What matters here is not the happy path but the boundaries: every call is
 * scoped to the authenticated user (a letterhead ends up on Grünen
 * corporate-identity paper, so a guessed id must not reach someone else's), a
 * duplicate label answers 409 rather than 500, and a missing row answers 404.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const listLetterheads = vi.fn();
const getLetterhead = vi.fn();
const createLetterhead = vi.fn();
const updateLetterhead = vi.fn();
const deleteLetterhead = vi.fn();

vi.mock('../../services/user/letterheadRepository.js', () => ({
  listLetterheads,
  getLetterhead,
  createLetterhead,
  updateLetterhead,
  deleteLetterhead,
}));

const { letterheadsContractRouter } = await import('./letterheadsContractRouter.js');

const ROW = {
  id: 'lh-1',
  label: 'KV Musterstadt',
  organization: 'KV Musterstadt',
  address: 'Weg 1\n12345 Ort',
  is_default: true,
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-01'),
};

const req = { user: { id: 'user-1' } } as never;

/** Postgres unique violation, as node-postgres reports it. */
function duplicateLabelError(): Error {
  return Object.assign(new Error('duplicate key'), { code: '23505' });
}

beforeEach(() => {
  for (const fn of [
    listLetterheads,
    getLetterhead,
    createLetterhead,
    updateLetterhead,
    deleteLetterhead,
  ]) {
    fn.mockReset();
  }
});

describe('listLetterheads', () => {
  it('returns only the caller’s rows', async () => {
    listLetterheads.mockResolvedValue([ROW]);

    const res = await letterheadsContractRouter.listLetterheads({ req } as never);

    expect(listLetterheads).toHaveBeenCalledWith('user-1');
    expect(res.status).toBe(200);
  });

  it('answers 500 rather than leaking the database error', async () => {
    listLetterheads.mockRejectedValue(new Error('relation does not exist'));

    const res = await letterheadsContractRouter.listLetterheads({ req } as never);

    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('relation does not exist');
  });
});

describe('createLetterhead', () => {
  it('creates for the authenticated user and answers 201', async () => {
    createLetterhead.mockResolvedValue(ROW);

    const res = await letterheadsContractRouter.createLetterhead({
      req,
      body: { label: 'KV Musterstadt' },
    } as never);

    expect(createLetterhead).toHaveBeenCalledWith('user-1', { label: 'KV Musterstadt' });
    expect(res.status).toBe(201);
  });

  it('turns a duplicate label into 409, not 500', async () => {
    createLetterhead.mockRejectedValue(duplicateLabelError());

    const res = await letterheadsContractRouter.createLetterhead({
      req,
      body: { label: 'KV Musterstadt' },
    } as never);

    // The picker has to stay unambiguous, and the client can act on a 409.
    expect(res.status).toBe(409);
  });
});

describe('updateLetterhead', () => {
  it('scopes the update to the caller', async () => {
    updateLetterhead.mockResolvedValue(ROW);

    await letterheadsContractRouter.updateLetterhead({
      req,
      params: { id: 'lh-1' },
      body: { label: 'Neu' },
    } as never);

    expect(updateLetterhead).toHaveBeenCalledWith('user-1', 'lh-1', { label: 'Neu' });
  });

  it('answers 404 for an id that is not the caller’s', async () => {
    // The repository filters by user_id, so a foreign id resolves to null.
    updateLetterhead.mockResolvedValue(null);

    const res = await letterheadsContractRouter.updateLetterhead({
      req,
      params: { id: 'someone-elses' },
      body: { label: 'Neu' },
    } as never);

    expect(res.status).toBe(404);
  });

  it('turns a duplicate label into 409', async () => {
    updateLetterhead.mockRejectedValue(duplicateLabelError());

    const res = await letterheadsContractRouter.updateLetterhead({
      req,
      params: { id: 'lh-1' },
      body: { label: 'KV Musterstadt' },
    } as never);

    expect(res.status).toBe(409);
  });
});

describe('deleteLetterhead', () => {
  it('checks ownership before deleting', async () => {
    getLetterhead.mockResolvedValue(ROW);
    deleteLetterhead.mockResolvedValue(true);

    const res = await letterheadsContractRouter.deleteLetterhead({
      req,
      params: { id: 'lh-1' },
      body: {},
    } as never);

    expect(getLetterhead).toHaveBeenCalledWith('user-1', 'lh-1');
    expect(res.status).toBe(200);
  });

  it('answers 404 without deleting when the row is not the caller’s', async () => {
    getLetterhead.mockResolvedValue(null);

    const res = await letterheadsContractRouter.deleteLetterhead({
      req,
      params: { id: 'someone-elses' },
      body: {},
    } as never);

    expect(res.status).toBe(404);
    expect(deleteLetterhead).not.toHaveBeenCalled();
  });
});

describe('without an authenticated user', () => {
  it('answers 500 instead of operating on an undefined user', async () => {
    // requireAuth is mounted at the prefix, so this is a safety guard rather
    // than a reachable path — but it must never fall through to the repository.
    const res = await letterheadsContractRouter.listLetterheads({ req: {} } as never);

    expect(res.status).toBe(500);
    expect(listLetterheads).not.toHaveBeenCalled();
  });
});
