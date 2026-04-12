/**
 * Regression tests for the Keycloak → Better Auth profile mapper.
 *
 * Locks in three invariants:
 *
 *   1. Happy path — a complete profile passes through unchanged, with email
 *      preserved as a string.
 *   2. Missing email — when Keycloak omits the email claim, the returned
 *      object MUST NOT contain an `email` key (Object.hasOwn === false).
 *      An explicit `undefined` would violate `exactOptionalPropertyTypes`
 *      and would also re-trigger the prod login loop fixed in 7f955e55.
 *   3. Diagnostic logging — every missing-email path emits a WARN with
 *      `idpHint`, `sub`, `preferredUsername`, and sorted `claimKeys`. This
 *      is the only way operators can tell which IdP is sending incomplete
 *      claims without reproducing a login flow.
 *
 * The logger is mocked via `vi.mock` so the mapper's `createLogger(...)`
 * call resolves to a stub at import time. Spying on a fresh
 * `createLogger(...)` from the test would NOT intercept the mapper's calls
 * because winston's `.child(...)` returns a new logger instance each call.
 *
 * Run: `pnpm --filter @gruenerator/api vitest run config/mapKeycloakProfileToUser`
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockWarn } = vi.hoisted(() => ({ mockWarn: vi.fn() }));

vi.mock('../utils/logger.js', () => ({
  createLogger: () => ({
    warn: mockWarn,
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  default: {
    warn: mockWarn,
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import AFTER vi.mock — `vi.mock` is hoisted, so the mapper's
// `createLogger('BetterAuth')` call inside the module resolves to the stub
// above before this `import` statement executes.
import { mapKeycloakProfileToUser } from './mapKeycloakProfileToUser.js';

afterEach(() => {
  mockWarn.mockClear();
});

describe('mapKeycloakProfileToUser — happy path', () => {
  it('preserves a valid email and does not warn', () => {
    const result = mapKeycloakProfileToUser(
      {
        sub: 'kc-uuid-123',
        email: 'alice@example.org',
        email_verified: true,
        name: 'Alice Example',
        preferred_username: 'alice',
        picture: 'https://example.org/alice.png',
      },
      'gruenes-netz',
      'de-DE'
    );

    expect(result.email).toBe('alice@example.org');
    expect(result.name).toBe('Alice Example');
    expect(result.emailVerified).toBe(true);
    expect(result.image).toBe('https://example.org/alice.png');
    expect(result.locale).toBe('de-DE');
    expect(result.authSource).toBe('gruenes-netz-login');
    expect(mockWarn).not.toHaveBeenCalled();
  });
});

describe('mapKeycloakProfileToUser — missing email', () => {
  it('omits the email key entirely when the claim is undefined', () => {
    const result = mapKeycloakProfileToUser(
      {
        sub: 'kc-uuid-456',
        name: 'Bob NoEmail',
        preferred_username: 'bob',
      },
      'gruenes-netz',
      'de-DE'
    );

    // Critical: NOT `result.email === undefined` — the key must be ABSENT.
    // exactOptionalPropertyTypes rejects `email: undefined`, and Better
    // Auth's adapter writes the key verbatim into Postgres.
    expect(Object.hasOwn(result, 'email')).toBe(false);
  });

  it('treats an empty-string email as missing', () => {
    const result = mapKeycloakProfileToUser(
      {
        sub: 'kc-uuid-789',
        email: '',
        name: 'Carol Empty',
      },
      'netzbegruenung',
      'de-DE'
    );

    expect(Object.hasOwn(result, 'email')).toBe(false);
    expect(mockWarn).toHaveBeenCalledOnce();
  });

  it('treats a non-string email as missing', () => {
    const result = mapKeycloakProfileToUser(
      {
        sub: 'kc-uuid-abc',
        email: 42,
        name: 'Dave WrongType',
      },
      'gruenerator-user',
      'de-DE'
    );

    expect(Object.hasOwn(result, 'email')).toBe(false);
    expect(mockWarn).toHaveBeenCalledOnce();
  });

  it('logs idpHint, sub, preferredUsername, and sorted claimKeys', () => {
    mapKeycloakProfileToUser(
      {
        sub: 'kc-uuid-456',
        name: 'Bob NoEmail',
        preferred_username: 'bob',
      },
      'gruenes-netz',
      'de-DE'
    );

    expect(mockWarn).toHaveBeenCalledOnce();
    const [message, meta] = mockWarn.mock.calls[0] ?? [];
    expect(message).toBe('[BetterAuth] Keycloak profile missing email claim');
    expect(meta).toEqual({
      idpHint: 'gruenes-netz',
      sub: 'kc-uuid-456',
      preferredUsername: 'bob',
      claimKeys: ['name', 'preferred_username', 'sub'],
    });
  });

  it('coerces non-string sub and preferred_username to null in the warn metadata', () => {
    mapKeycloakProfileToUser({ sub: 12345, preferred_username: false }, 'gruenes-netz', 'de-DE');

    expect(mockWarn).toHaveBeenCalledOnce();
    const [, meta] = mockWarn.mock.calls[0] ?? [];
    expect(meta).toMatchObject({ sub: null, preferredUsername: null });
  });

  it('still produces a usable name from preferred_username when name is also missing', () => {
    const result = mapKeycloakProfileToUser(
      {
        sub: 'kc-uuid-only',
        preferred_username: 'edna',
      },
      'gruenes-netz',
      'de-DE'
    );

    expect(result.name).toBe('edna');
    expect(Object.hasOwn(result, 'email')).toBe(false);
  });
});

describe('mapKeycloakProfileToUser — locale + authSource composition', () => {
  it('honors de-AT locale and stamps authSource from idpHint', () => {
    const result = mapKeycloakProfileToUser(
      { sub: 'kc-at-1', email: 'wien@example.at', name: 'Franz' },
      'gruene-at-login',
      'de-AT'
    );

    expect(result.locale).toBe('de-AT');
    expect(result.authSource).toBe('gruene-at-login-login');
  });
});
