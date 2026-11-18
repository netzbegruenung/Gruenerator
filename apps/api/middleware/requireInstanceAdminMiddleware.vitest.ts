import { type NextFunction, type Request, type Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const isAdmin = vi.fn();
vi.mock('../utils/adminAuthz.js', () => ({ requireInstanceAdmin: isAdmin }));

const { requireInstanceAdminMiddleware } = await import('./requireInstanceAdminMiddleware.js');

function mockRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  };
  return res;
}

describe('requireInstanceAdminMiddleware', () => {
  beforeEach(() => isAdmin.mockReset());

  it('answers 403 for a non-admin', async () => {
    isAdmin.mockResolvedValue(false);
    const res = mockRes();
    const next = vi.fn();
    await requireInstanceAdminMiddleware(
      { user: { id: 'u1', email: 'a@b.c' } } as unknown as Request,
      res as unknown as Response,
      next as NextFunction
    );
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ success: false, code: 'FORBIDDEN' });
    expect(next).not.toHaveBeenCalled();
  });

  it('answers 403 without a user', async () => {
    const res = mockRes();
    const next = vi.fn();
    await requireInstanceAdminMiddleware({} as Request, res as unknown as Response, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next for an admin', async () => {
    isAdmin.mockResolvedValue(true);
    const res = mockRes();
    const next = vi.fn();
    await requireInstanceAdminMiddleware(
      { user: { id: 'u1', email: 'a@b.c' } } as unknown as Request,
      res as unknown as Response,
      next as NextFunction
    );
    expect(next).toHaveBeenCalledWith();
    expect(res.statusCode).toBe(0);
  });
});
