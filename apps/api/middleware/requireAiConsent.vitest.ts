/**
 * `requireAiConsent` — die serverseitige Durchsetzung der Art.-9-Einwilligung.
 *
 * Vier Zusagen werden hier festgenagelt, weil ein Bruch jeweils teuer wäre:
 *
 *   1. Ohne `ENFORCE_AI_CONSENT` lässt die Middleware durch. Das ist kein
 *      Detail, sondern der Grund, warum sie überhaupt gefahrlos deployt werden
 *      kann, bevor das Mobile-Release mit dem Gate im Store ist.
 *   2. Mit Einwilligung läuft der Aufruf durch — auch bei eingeschalteter
 *      Durchsetzung.
 *   3. Ohne Einwilligung kommt **403**, niemals 401: auf 401 räumen beide
 *      Clients die Anmeldung ab.
 *   4. Ohne aufgelöste Sitzung wird durchgelassen — die 401 gehört
 *      `requireAuth`, und ein 403 auf einen anonymen Aufruf wäre die falsche
 *      Auskunft.
 *
 * Dass der Dev-Bypass-Nutzer als eingewilligt gilt, hängt an seinem festen
 * Zeitstempel in `authMiddleware.ts` — festgenagelt in `authMiddleware.vitest.ts`.
 */

import { AI_CONSENT_REQUIRED_CODE, type UserProfile } from '@gruenerator/contracts';
import { type NextFunction, type Request, type Response } from 'express';
import { beforeEach, describe, it, expect, vi } from 'vitest';

const envMock = { ENFORCE_AI_CONSENT: false };

vi.mock('../config/env.js', () => ({
  get env() {
    return envMock;
  },
}));

const { requireAiConsent } = await import('./requireAiConsent.js');

function mockReq(user?: Partial<UserProfile>): Request {
  return {
    originalUrl: '/api/chat-graph/stream?foo=1',
    ...(user ? { user } : {}),
  } as unknown as Request;
}

function mockRes(): Response & { statusCode?: number; body?: unknown } {
  const res = {
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  } as unknown as Response & { statusCode?: number; body?: unknown };
  return res;
}

describe('requireAiConsent', () => {
  let next: NextFunction;

  beforeEach(() => {
    envMock.ENFORCE_AI_CONSENT = false;
    next = vi.fn();
  });

  it('lässt ohne ENFORCE_AI_CONSENT auch ohne Einwilligung durch', () => {
    const res = mockRes();
    requireAiConsent(mockReq({ id: 'u1', ai_consent_at: null }), res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBeUndefined();
  });

  it('lässt mit Einwilligung durch', () => {
    envMock.ENFORCE_AI_CONSENT = true;
    const res = mockRes();
    requireAiConsent(mockReq({ id: 'u1', ai_consent_at: '2026-08-10T10:00:00.000Z' }), res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBeUndefined();
  });

  it('antwortet ohne Einwilligung mit 403 und eigenem Code — nicht 401', () => {
    envMock.ENFORCE_AI_CONSENT = true;
    const res = mockRes();
    requireAiConsent(mockReq({ id: 'u1', ai_consent_at: null }), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect((res.body as { code?: string }).code).toBe(AI_CONSENT_REQUIRED_CODE);
  });

  it('lässt anonyme Aufrufe durch — die 401 gehört requireAuth', () => {
    envMock.ENFORCE_AI_CONSENT = true;
    const res = mockRes();
    requireAiConsent(mockReq(), res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBeUndefined();
  });
});
