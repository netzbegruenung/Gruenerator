import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it, vi } from 'vitest';

import { handleUnauthorized, type UnauthorizedDeps } from './api';

/**
 * The 401-recovery policy. Every branch here corresponds to a bug that has
 * already shipped: wiping auth on a flaky 401 logged users out mid-session
 * (`636b1025c wire all 401 surfaces to the shared authority`), and wiping under
 * the dev bypass bounced the emulator straight back to login.
 */

function axiosErrorWithStatus(status: number): AxiosError {
  const error = new AxiosError('probe failed');
  error.response = {
    status,
    statusText: '',
    data: null,
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  };
  return error;
}

function makeDeps(overrides: Partial<UnauthorizedDeps> = {}): {
  deps: UnauthorizedDeps;
  clearStoredAuth: ReturnType<typeof vi.fn>;
  clearAuthStore: ReturnType<typeof vi.fn>;
} {
  const clearStoredAuth = vi.fn(async () => undefined);
  const clearAuthStore = vi.fn();
  return {
    clearStoredAuth,
    clearAuthStore,
    deps: {
      devAuthBypass: false,
      probeSession: async () => null,
      clearStoredAuth,
      clearAuthStore,
      ...overrides,
    },
  };
}

describe('handleUnauthorized', () => {
  it('never probes or wipes under the dev auth bypass', async () => {
    const probeSession = vi.fn();
    const { deps, clearStoredAuth, clearAuthStore } = makeDeps({
      devAuthBypass: true,
      probeSession,
    });

    expect(await handleUnauthorized(deps)).toBe(false);
    expect(probeSession).not.toHaveBeenCalled();
    expect(clearStoredAuth).not.toHaveBeenCalled();
    expect(clearAuthStore).not.toHaveBeenCalled();
  });

  it('retries once when the probe proves the session is alive', async () => {
    const { deps, clearStoredAuth, clearAuthStore } = makeDeps({
      probeSession: async () => ({ user: { id: 'u1' } }),
    });

    expect(await handleUnauthorized(deps)).toBe(true);
    expect(clearStoredAuth).not.toHaveBeenCalled();
    expect(clearAuthStore).not.toHaveBeenCalled();
  });

  it('wipes when the probe succeeds but carries no user', async () => {
    const { deps, clearStoredAuth, clearAuthStore } = makeDeps({
      probeSession: async () => ({}),
    });

    expect(await handleUnauthorized(deps)).toBe(false);
    expect(clearStoredAuth).toHaveBeenCalledOnce();
    expect(clearAuthStore).toHaveBeenCalledOnce();
  });

  it('wipes when the probe returns null', async () => {
    const { deps, clearStoredAuth, clearAuthStore } = makeDeps({ probeSession: async () => null });

    expect(await handleUnauthorized(deps)).toBe(false);
    expect(clearStoredAuth).toHaveBeenCalledOnce();
    expect(clearAuthStore).toHaveBeenCalledOnce();
  });

  it.each([401, 403])('wipes when the probe itself returns %i', async (status) => {
    const { deps, clearStoredAuth, clearAuthStore } = makeDeps({
      probeSession: async () => {
        throw axiosErrorWithStatus(status);
      },
    });

    expect(await handleUnauthorized(deps)).toBe(false);
    expect(clearStoredAuth).toHaveBeenCalledOnce();
    expect(clearAuthStore).toHaveBeenCalledOnce();
  });

  it.each([500, 502, 504])(
    'keeps the session when the probe fails with an indeterminate %i',
    async (status) => {
      const { deps, clearStoredAuth, clearAuthStore } = makeDeps({
        probeSession: async () => {
          throw axiosErrorWithStatus(status);
        },
      });

      expect(await handleUnauthorized(deps)).toBe(false);
      expect(clearStoredAuth).not.toHaveBeenCalled();
      expect(clearAuthStore).not.toHaveBeenCalled();
    }
  );

  it('keeps the session when the probe never reaches the server', async () => {
    // No `response` at all — a timeout or a dead connection. Indeterminate, so
    // local auth must survive; this is the regression that logged users out on
    // a train ride.
    const { deps, clearStoredAuth, clearAuthStore } = makeDeps({
      probeSession: async () => {
        throw new AxiosError('Network Error', AxiosError.ERR_NETWORK);
      },
    });

    expect(await handleUnauthorized(deps)).toBe(false);
    expect(clearStoredAuth).not.toHaveBeenCalled();
    expect(clearAuthStore).not.toHaveBeenCalled();
  });

  it('keeps the session when the probe throws a non-axios error', async () => {
    const { deps, clearStoredAuth, clearAuthStore } = makeDeps({
      probeSession: async () => {
        throw new TypeError('undefined is not a function');
      },
    });

    expect(await handleUnauthorized(deps)).toBe(false);
    expect(clearStoredAuth).not.toHaveBeenCalled();
    expect(clearAuthStore).not.toHaveBeenCalled();
  });

  it('clears storage before the in-memory store', async () => {
    const order: string[] = [];
    const { deps } = makeDeps({
      probeSession: async () => ({}),
      clearStoredAuth: async () => {
        order.push('storage');
      },
      clearAuthStore: () => {
        order.push('store');
      },
    });

    await handleUnauthorized(deps);
    expect(order).toEqual(['storage', 'store']);
  });
});
