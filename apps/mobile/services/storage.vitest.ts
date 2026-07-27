import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  __resetSecureStore,
  __setSecureStoreFailure,
  getItemAsync,
} from '../test/stubs/expo-secure-store';

import { secureStorage, STORAGE_KEYS } from './storage';

/**
 * `secureStorage` is deliberately asymmetric: reads and removes swallow failures
 * (a missing token just means "logged out"), writes rethrow (silently losing the
 * token after a successful login would strand the user in a half-logged-in
 * state). That asymmetry is easy to "tidy up" by accident, so it is pinned here.
 */

beforeEach(() => {
  __resetSecureStore();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('round-tripping', () => {
  it('stores and reads the token', async () => {
    await secureStorage.setToken('tok-1');
    expect(await secureStorage.getToken()).toBe('tok-1');
  });

  it('keeps token, user and expiry under separate keys', async () => {
    await secureStorage.setToken('tok-1');
    await secureStorage.setUser('{"id":"u1"}');
    await secureStorage.setExpiresAt('2026-08-01T00:00:00.000Z');

    expect(await getItemAsync(STORAGE_KEYS.AUTH_TOKEN)).toBe('tok-1');
    expect(await getItemAsync(STORAGE_KEYS.AUTH_USER)).toBe('{"id":"u1"}');
    expect(await getItemAsync(STORAGE_KEYS.AUTH_EXPIRES_AT)).toBe('2026-08-01T00:00:00.000Z');
  });

  it('returns null for a key that was never written', async () => {
    expect(await secureStorage.getToken()).toBeNull();
    expect(await secureStorage.getUser()).toBeNull();
    expect(await secureStorage.getExpiresAt()).toBeNull();
  });
});

describe('clearAll', () => {
  it('removes all three keys', async () => {
    await secureStorage.setToken('tok-1');
    await secureStorage.setUser('{"id":"u1"}');
    await secureStorage.setExpiresAt('2026-08-01T00:00:00.000Z');

    await secureStorage.clearAll();

    expect(await secureStorage.getToken()).toBeNull();
    expect(await secureStorage.getUser()).toBeNull();
    expect(await secureStorage.getExpiresAt()).toBeNull();
  });

  it('resolves even when the keystore is unavailable', async () => {
    // clearAll runs on the 401 path; a rejection there would surface as an
    // unhandled promise rejection inside an axios interceptor.
    await secureStorage.setToken('tok-1');
    __setSecureStoreFailure(new Error('keystore locked'));

    await expect(secureStorage.clearAll()).resolves.toBeUndefined();
  });
});

describe('failure handling', () => {
  it('swallows read failures and reports "logged out"', async () => {
    __setSecureStoreFailure(new Error('keystore locked'));

    expect(await secureStorage.getToken()).toBeNull();
    expect(await secureStorage.getUser()).toBeNull();
    expect(await secureStorage.getExpiresAt()).toBeNull();
  });

  it('swallows remove failures', async () => {
    __setSecureStoreFailure(new Error('keystore locked'));

    await expect(secureStorage.removeToken()).resolves.toBeUndefined();
    await expect(secureStorage.removeUser()).resolves.toBeUndefined();
    await expect(secureStorage.removeExpiresAt()).resolves.toBeUndefined();
  });

  it('rethrows token and user write failures', async () => {
    __setSecureStoreFailure(new Error('keystore locked'));

    await expect(secureStorage.setToken('tok-1')).rejects.toThrow('keystore locked');
    await expect(secureStorage.setUser('{}')).rejects.toThrow('keystore locked');
  });

  it('swallows an expiry write failure, which is only a hint', async () => {
    __setSecureStoreFailure(new Error('keystore locked'));

    await expect(secureStorage.setExpiresAt('2026-08-01T00:00:00.000Z')).resolves.toBeUndefined();
  });
});
