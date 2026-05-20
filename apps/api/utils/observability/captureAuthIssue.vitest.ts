/**
 * Unit tests for the auth-telemetry helper.
 *
 * These pin three invariants the GlitchTip auth-observability strategy
 * depends on:
 *
 *   1. `captureAuthIssue` calls `Sentry.captureException` with the right
 *      `auth.stage` / `auth.transport` tags and a symptom-based fingerprint
 *      (`['auth', stage, errorName]`), so events cluster predictably.
 *   2. Benign auth noise (SESSION_NOT_FOUND, INVALID_STATE, expired JWTs,
 *      OAuth state replays, client disconnects) is suppressed before it
 *      reaches Sentry — without this the dashboard floods with non-actionable
 *      logged-out 401s.
 *   3. The sentinel marker prevents double-capture when a plugin endpoint
 *      captures explicitly and then re-throws into Better Auth's
 *      `onAPIError` hook — would otherwise produce two events per failure.
 *
 * Run: `pnpm --filter @gruenerator/api test`
 */

import { type Request } from 'express';
import { beforeEach, describe, it, expect, vi, afterEach } from 'vitest';

const captureExceptionMock = vi.fn();
const setTagMock = vi.fn();
const setFingerprintMock = vi.fn();
const setExtrasMock = vi.fn();
const setExtraMock = vi.fn();

vi.mock('@sentry/node', () => ({
  withScope: (cb: (scope: unknown) => void) => {
    cb({
      setTag: setTagMock,
      setFingerprint: setFingerprintMock,
      setExtras: setExtrasMock,
      setExtra: setExtraMock,
    });
  },
  captureException: captureExceptionMock,
}));

vi.mock('../../config/env.js', () => ({
  env: { LOG_LEVEL: 'warn', NODE_ENV: 'test' as const },
}));

const { captureAuthIssue, isAlreadyCaptured } = await import('./captureAuthIssue.js');

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    originalUrl: '/api/test',
    ...overrides,
  } as unknown as Request;
}

beforeEach(() => {
  captureExceptionMock.mockReset();
  setTagMock.mockReset();
  setFingerprintMock.mockReset();
  setExtrasMock.mockReset();
  setExtraMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('captureAuthIssue', () => {
  it('captures with auth.stage + transport tags and symptom fingerprint', () => {
    const err = new TypeError('boom');
    captureAuthIssue({ stage: 'session-resolve', cause: err, req: mockReq() });

    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    expect(captureExceptionMock).toHaveBeenCalledWith(err);
    expect(setTagMock).toHaveBeenCalledWith('auth.stage', 'session-resolve');
    expect(setTagMock).toHaveBeenCalledWith('auth.transport', 'web');
    expect(setFingerprintMock).toHaveBeenCalledWith(['auth', 'session-resolve', 'TypeError']);
  });

  it('tags transport as mobile when X-App-Platform header is set', () => {
    captureAuthIssue({
      stage: 'logout',
      cause: new Error('x'),
      req: mockReq({ headers: { 'x-app-platform': 'ios' } as Request['headers'] }),
    });
    expect(setTagMock).toHaveBeenCalledWith('auth.transport', 'mobile');
  });

  it('tags transport as api when no request is provided', () => {
    captureAuthIssue({ stage: 'better-auth', cause: new Error('x') });
    expect(setTagMock).toHaveBeenCalledWith('auth.transport', 'api');
  });

  it('passes extras through and adds originalUrl', () => {
    const req = mockReq({ originalUrl: '/api/auth/v2/callback/keycloak-x' });
    captureAuthIssue({
      stage: 'oauth-callback',
      cause: new Error('x'),
      req,
      extras: { providerId: 'keycloak-x' },
    });
    expect(setExtrasMock).toHaveBeenCalledWith({ providerId: 'keycloak-x' });
    expect(setExtraMock).toHaveBeenCalledWith('originalUrl', '/api/auth/v2/callback/keycloak-x');
  });

  describe('benign suppression', () => {
    it('suppresses errors with SESSION_NOT_FOUND code', () => {
      captureAuthIssue({
        stage: 'session-resolve',
        cause: { code: 'SESSION_NOT_FOUND', message: 'no session' },
      });
      expect(captureExceptionMock).not.toHaveBeenCalled();
    });

    it('suppresses errors with INVALID_STATE code (OAuth replay)', () => {
      captureAuthIssue({ stage: 'oauth-callback', cause: { code: 'INVALID_STATE' } });
      expect(captureExceptionMock).not.toHaveBeenCalled();
    });

    it('suppresses TokenExpiredError by name', () => {
      const err = new Error('jwt expired');
      err.name = 'TokenExpiredError';
      captureAuthIssue({ stage: 'token-exchange', cause: err });
      expect(captureExceptionMock).not.toHaveBeenCalled();
    });

    it('suppresses AbortError by name (client disconnect)', () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      captureAuthIssue({ stage: 'session-resolve', cause: err });
      expect(captureExceptionMock).not.toHaveBeenCalled();
    });

    it('suppresses ECONNRESET by code', () => {
      const err = Object.assign(new Error('reset'), { code: 'ECONNRESET' });
      captureAuthIssue({ stage: 'session-resolve', cause: err });
      expect(captureExceptionMock).not.toHaveBeenCalled();
    });

    it('suppresses "Login code is invalid or expired" message', () => {
      captureAuthIssue({
        stage: 'token-exchange',
        cause: new Error('Login code is invalid or expired'),
      });
      expect(captureExceptionMock).not.toHaveBeenCalled();
    });

    it('suppresses please_restart_the_process redirect message', () => {
      captureAuthIssue({
        stage: 'auth-error-route',
        cause: new Error('please_restart_the_process'),
      });
      expect(captureExceptionMock).not.toHaveBeenCalled();
    });
  });

  describe('sentinel double-capture prevention', () => {
    it('marks the error after capturing', () => {
      const err = new Error('x');
      captureAuthIssue({ stage: 'logout', cause: err });
      expect(isAlreadyCaptured(err)).toBe(true);
    });

    it('skips already-captured errors on the second call', () => {
      const err = new Error('x');
      captureAuthIssue({ stage: 'logout', cause: err });
      captureExceptionMock.mockReset();
      captureAuthIssue({ stage: 'better-auth', cause: err });
      expect(captureExceptionMock).not.toHaveBeenCalled();
    });

    it('isAlreadyCaptured is false for fresh errors and non-objects', () => {
      expect(isAlreadyCaptured(new Error('x'))).toBe(false);
      expect(isAlreadyCaptured(null)).toBe(false);
      expect(isAlreadyCaptured('string-throw')).toBe(false);
      expect(isAlreadyCaptured(undefined)).toBe(false);
    });
  });
});
