import { beforeEach, describe, expect, it, vi } from 'vitest';

const findUserById = vi.fn();
const store = new Map<string, string>();
const secondaryStorage = {
  get: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
  set: vi.fn((key: string, value: string) => {
    store.set(key, value);
    return Promise.resolve();
  }),
  delete: vi.fn(),
};

vi.mock('../config/betterAuth.js', () => ({
  auth: {
    get $context() {
      return Promise.resolve({
        options: { secondaryStorage },
        internalAdapter: { findUserById },
      });
    },
  },
}));

const { refreshSessionUserSnapshot } = await import('./betterAuthSessionUser.js');

const USER_ID = 'user-1';
const IN_A_WEEK = Date.now() + 7 * 24 * 60 * 60 * 1000;

function seedSession(token: string, expiresAt: number, user: Record<string, unknown>) {
  store.set(token, JSON.stringify({ session: { token, expiresAt }, user }));
}

describe('refreshSessionUserSnapshot', () => {
  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
  });

  it('rewrites the cached user of every live session, keeping the session untouched', async () => {
    store.set(
      `active-sessions-${USER_ID}`,
      JSON.stringify([
        { token: 'tok-a', expiresAt: IN_A_WEEK },
        { token: 'tok-b', expiresAt: IN_A_WEEK },
      ])
    );
    seedSession('tok-a', IN_A_WEEK, { id: USER_ID, chat_background: 'sunrise' });
    seedSession('tok-b', IN_A_WEEK, { id: USER_ID, chat_background: 'sunrise' });
    findUserById.mockResolvedValue({ id: USER_ID, chat_background: 'tanne' });

    await refreshSessionUserSnapshot(USER_ID);

    for (const token of ['tok-a', 'tok-b']) {
      const cached = JSON.parse(store.get(token) as string) as {
        session: { token: string };
        user: { chat_background: string };
      };
      expect(cached.user.chat_background).toBe('tanne');
      expect(cached.session.token).toBe(token);
    }
  });

  it('skips sessions that have already expired', async () => {
    const expired = Date.now() - 1000;
    store.set(
      `active-sessions-${USER_ID}`,
      JSON.stringify([{ token: 'tok-old', expiresAt: expired }])
    );
    seedSession('tok-old', expired, { id: USER_ID, chat_background: 'sunrise' });
    findUserById.mockResolvedValue({ id: USER_ID, chat_background: 'tanne' });

    await refreshSessionUserSnapshot(USER_ID);

    expect(secondaryStorage.set).not.toHaveBeenCalled();
  });

  it('is a no-op when the user has no active sessions', async () => {
    findUserById.mockResolvedValue({ id: USER_ID, chat_background: 'tanne' });

    await refreshSessionUserSnapshot(USER_ID);

    expect(secondaryStorage.set).not.toHaveBeenCalled();
  });

  it('swallows storage failures so the profile write that already succeeded still returns 200', async () => {
    store.set(
      `active-sessions-${USER_ID}`,
      JSON.stringify([{ token: 'tok-a', expiresAt: IN_A_WEEK }])
    );
    seedSession('tok-a', IN_A_WEEK, { id: USER_ID });
    findUserById.mockRejectedValue(new Error('redis down'));

    await expect(refreshSessionUserSnapshot(USER_ID)).resolves.toBeUndefined();
  });
});
