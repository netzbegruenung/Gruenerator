/**
 * „Zu meinen Grüneratoren": jede Operation läuft auf der angemeldeten Person,
 * nie auf einer aus dem Request, und ein Datenbankfehler kommt als 500 mit
 * deutscher Meldung an statt als nackter Absturz.
 */
import { listUserLibraryResponseSchema } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Request } from 'express';

const service = vi.hoisted(() => ({
  listUserLibrary: vi.fn(),
  addToUserLibrary: vi.fn(),
  removeFromUserLibrary: vi.fn(),
}));

vi.mock('../../services/user/userLibraryService.js', () => service);

const { userLibraryContractRouter } = await import('./userLibraryContractRouter.js');

const req = { user: { id: 'user-1' } } as unknown as Request;

beforeEach(() => {
  service.listUserLibrary.mockReset().mockResolvedValue([]);
  service.addToUserLibrary.mockReset().mockResolvedValue(true);
  service.removeFromUserLibrary.mockReset().mockResolvedValue(undefined);
});

describe('userLibraryContractRouter', () => {
  it('lists the caller’s items in the contract shape', async () => {
    service.listUserLibrary.mockResolvedValue([
      { kind: 'agent', ref: 'gruenerator-rede', createdAt: '2026-10-14T08:00:00.000Z' },
    ]);
    const res = await userLibraryContractRouter.list({ req } as never);

    expect(service.listUserLibrary).toHaveBeenCalledWith('user-1');
    expect(res.status).toBe(200);
    expect(listUserLibraryResponseSchema.parse(res.body).items).toHaveLength(1);
  });

  it('adds and removes for the caller only', async () => {
    const params = { kind: 'recipe' as const, ref: 'pressemitteilung' };
    expect((await userLibraryContractRouter.add({ req, params } as never)).status).toBe(200);
    expect((await userLibraryContractRouter.remove({ req, params } as never)).status).toBe(200);

    expect(service.addToUserLibrary).toHaveBeenCalledWith('user-1', 'recipe', 'pressemitteilung');
    expect(service.removeFromUserLibrary).toHaveBeenCalledWith(
      'user-1',
      'recipe',
      'pressemitteilung'
    );
  });

  it('refuses to add past the per-person ceiling', async () => {
    service.addToUserLibrary.mockResolvedValue(false);
    const res = await userLibraryContractRouter.add({
      req,
      params: { kind: 'agent', ref: 'x' },
    } as never);

    expect(res.status).toBe(409);
  });

  it('turns a database failure into a 500 with a readable message', async () => {
    service.addToUserLibrary.mockRejectedValue(new Error('connection reset'));
    const res = await userLibraryContractRouter.add({
      req,
      params: { kind: 'agent', ref: 'x' },
    } as never);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: 'Deine Grüneratoren konnten gerade nicht gespeichert werden.',
    });
  });
});
