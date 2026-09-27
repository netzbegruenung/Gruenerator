import { type RequestValidationError } from '@ts-rest/express';
import { type NextFunction, type Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { logContractValidationError } from './contractValidationLogger.js';

import type { Logger } from 'winston';

function makeLog() {
  return { warn: vi.fn(), error: vi.fn() } as unknown as Logger;
}

function makeRes() {
  const res = {
    headersSent: false,
    status: vi.fn(() => res),
    json: vi.fn(() => res),
  };
  return res as unknown as Response & { status: ReturnType<typeof vi.fn> };
}

function makeError(overrides: Partial<RequestValidationError> = {}): RequestValidationError {
  return {
    pathParams: null,
    headers: null,
    query: { issues: [{ code: 'too_big', path: ['q'] }] },
    body: null,
    ...overrides,
  } as unknown as RequestValidationError;
}

const req = { method: 'GET', originalUrl: '/api/global-search/office?q=x' };

describe('logContractValidationError', () => {
  it('answers 400 with the offending issues instead of deferring to the 500 handler', () => {
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;
    const err = makeError();

    logContractValidationError(makeLog(), 'globalSearchContract')(err, { ...req }, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(err.query);
    expect(next).not.toHaveBeenCalled();
  });

  it('logs at warn — a malformed request is a client bug, not an outage', () => {
    const log = makeLog();

    logContractValidationError(log, 'scope')(makeError(), { ...req }, makeRes(), vi.fn());

    expect(log.warn).toHaveBeenCalled();
    expect(log.error).not.toHaveBeenCalled();
  });

  it('truncates a multi-KB request URL in the log line', () => {
    const log = makeLog();
    const longUrl = `/api/global-search/office?q=${'a'.repeat(4000)}`;

    logContractValidationError(log, 'scope')(
      makeError(),
      { method: 'GET', originalUrl: longUrl },
      makeRes(),
      vi.fn()
    );

    const loggedUrl = vi.mocked(log.warn).mock.calls[0]?.[3] as string;
    expect(loggedUrl.length).toBeLessThan(300);
    expect(loggedUrl).toContain(`(${longUrl.length} chars)`);
  });

  it('falls through when a response was already sent', () => {
    const res = makeRes();
    (res as unknown as { headersSent: boolean }).headersSent = true;
    const next = vi.fn();
    const err = makeError();

    logContractValidationError(makeLog(), 'scope')(err, { ...req }, res, next);

    expect(next).toHaveBeenCalledWith(err);
    expect(res.status).not.toHaveBeenCalled();
  });
});
