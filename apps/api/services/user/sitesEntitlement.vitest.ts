import { profileUpdateBodySchema } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getProfileById = vi.fn();

vi.mock('./ProfileService.js', () => ({
  getProfileService: () => ({ getProfileById }),
}));

import { isSitesEntitled, requireSitesAccess } from './sitesEntitlement.js';

const USER_ID = '6f1c1d1e-8f3a-4c2b-9a51-2b7f0c4d9e10';

async function run(handler: typeof requireSitesAccess, req: Record<string, unknown>) {
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    next: vi.fn(),
  };
  await handler(req as never, res as never, res.next);
  return res;
}

beforeEach(() => {
  getProfileById.mockReset();
});

describe('isSitesEntitled', () => {
  it.each([
    [true, true],
    [false, false],
    [null, false],
    [undefined, false],
  ])('isSitesEntitled(%s) is %s', (decision, expected) =>
    expect(isSitesEntitled(decision)).toBe(expected)
  );
});

describe('requireSitesAccess', () => {
  it('answers 403 for an account without the unlock', async () => {
    getProfileById.mockResolvedValueOnce({ sites_unlocked: null });
    const res = await run(requireSitesAccess, { user: { id: USER_ID } });
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'Sites ist für dein Konto nicht freigeschaltet' });
    expect(res.next).not.toHaveBeenCalled();
  });

  it('lets an instance admin (is_admin) without the unlock through', async () => {
    getProfileById.mockResolvedValueOnce({ sites_unlocked: null, is_admin: true });
    expect((await run(requireSitesAccess, { user: { id: USER_ID } })).next).toHaveBeenCalledOnce();
    expect(getProfileById).toHaveBeenCalledTimes(1);
  });

  it('does not treat an ADMIN_EMAILS-only account (is_admin false) as entitled', async () => {
    getProfileById.mockResolvedValueOnce({
      sites_unlocked: null,
      is_admin: false,
      email: 'env-admin@example.org',
    });
    const res = await run(requireSitesAccess, { user: { id: USER_ID } });
    expect(res.statusCode).toBe(403);
  });

  it('lets an unlocked account through', async () => {
    getProfileById.mockResolvedValueOnce({ sites_unlocked: true });
    expect((await run(requireSitesAccess, { user: { id: USER_ID } })).next).toHaveBeenCalledOnce();
  });

  it('answers 401 without a user', async () => {
    const res = await run(requireSitesAccess, {});
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Nicht authentifiziert' });
    expect(getProfileById).not.toHaveBeenCalled();
  });
});

describe('profileUpdateBodySchema', () => {
  it('does not let a person write the unlock themselves', () => {
    expect(Object.keys(profileUpdateBodySchema.shape)).not.toContain('sites_unlocked');
  });
});
