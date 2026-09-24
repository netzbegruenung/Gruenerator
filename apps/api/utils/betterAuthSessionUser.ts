import { auth } from '../config/betterAuth.js';

import { createLogger } from './logger.js';

const log = createLogger('betterAuthSessionUser');

/** Shape Better Auth stores under `ba:<session-token>` in secondary storage. */
interface CachedSessionEnvelope {
  session: { expiresAt: string | number | Date };
  user: unknown;
}

/** Shape Better Auth stores under `ba:active-sessions-<userId>`. */
interface ActiveSessionEntry {
  token: string;
  expiresAt: number;
}

/**
 * `SecondaryStorage.get` gibt seit better-auth 1.7 `unknown` zurück statt
 * `string | null` — ein Adapter darf bereits geparste Werte liefern. Unserer
 * (Redis) liefert weiterhin Zeichenketten; alles andere ist für uns kein Wert.
 */
function parseJson<T>(raw: unknown): T | null {
  if (typeof raw !== 'string') return null;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Re-snapshot the cached Better Auth **user** object for every live session of
 * a user.
 *
 * Better Auth freezes the user row into secondary storage (Redis) when the
 * session is created, and never re-reads it: `internalAdapter.findSession()`
 * answers straight from `ba:<token>`, and the rolling `updateSession()` refresh
 * explicitly carries the *old* `user` forward. Only writes that go through
 * `internalAdapter.updateUser()` re-snapshot it (via its private
 * `refreshUserSessions`).
 *
 * Every profile write here goes through Drizzle instead, so without this the
 * snapshot stays stale for the whole 30-day session lifetime — `getSession()`
 * keeps serving the values the user had at login, and settings like the chat
 * background visibly revert to their defaults on the next reload. Bypassing the
 * cookie cache does NOT help: that read falls through to the same stale
 * snapshot.
 *
 * Best-effort by design — a Redis hiccup must never fail the profile write that
 * already succeeded.
 */
export async function refreshSessionUserSnapshot(userId: string): Promise<void> {
  try {
    const ctx = await auth.$context;
    const { secondaryStorage } = ctx.options;
    if (!secondaryStorage) return;

    const user = await ctx.internalAdapter.findUserById(userId);
    if (!user) return;

    const entries = parseJson<ActiveSessionEntry[]>(
      await secondaryStorage.get(`active-sessions-${userId}`)
    );
    if (!entries?.length) return;

    const now = Date.now();
    await Promise.all(
      entries
        .filter((entry) => entry.expiresAt > now)
        .map(async ({ token }) => {
          const cached = parseJson<CachedSessionEnvelope>(await secondaryStorage.get(token));
          if (!cached) return;
          const ttl = Math.floor((new Date(cached.session.expiresAt).getTime() - now) / 1000);
          if (ttl <= 0) return;
          await secondaryStorage.set(token, JSON.stringify({ session: cached.session, user }), ttl);
        })
    );
  } catch (err) {
    log.warn(
      '[BetterAuth] session user snapshot refresh failed for %s: %s',
      userId,
      (err as Error).message
    );
  }
}
