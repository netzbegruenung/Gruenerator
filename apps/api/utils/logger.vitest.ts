/**
 * Was hier leise falsch werden könnte: ein geloggter Axios-Fehler schreibt die
 * Request-Header samt Bearer-Token ins Log.
 */
import { Writable } from 'node:stream';

import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import * as winston from 'winston';

vi.mock('../config/env.js', () => ({ env: { LOG_LEVEL: 'info' } }));

const { default: logger, createLogger } = await import('./logger.js');

const SECRET = 'test-secret-not-a-real-key';

function capture(): () => string {
  let out = '';
  const stream = new Writable({
    write(chunk: Buffer, _enc, done) {
      out += chunk.toString();
      done();
    },
  });
  logger.add(new winston.transports.Stream({ stream }));
  return () => out;
}

function nangoError(): AxiosError {
  const headers = new AxiosHeaders({ Authorization: `Bearer ${SECRET}` });
  const config = {
    method: 'post',
    url: 'http://nango:3003/connect/sessions?token=abc',
    headers,
  };
  return new AxiosError('Request failed with status code 400', 'ERR_BAD_REQUEST', config, null, {
    status: 400,
    statusText: 'Bad Request',
    headers: {},
    config,
    data: { error: { code: 'invalid_body', message: 'Integration does not exist' } },
  });
}

describe('logger and axios errors', () => {
  const log = createLogger('test');

  it.each([
    ['as meta', () => log.error('[x] failed', nangoError())],
    ['nested', () => log.error('[x] failed', { error: nangoError() })],
  ])('drops headers and keeps the diagnosis (%s)', (_label, emit) => {
    const read = capture();
    emit();
    const line = read();
    expect(line).not.toContain(SECRET);
    expect(line).not.toContain('token=abc');
    expect(line).toContain('Integration does not exist');
    expect(line).toContain('http://nango:3003/connect/sessions');
    expect(line).toContain('POST');
  });
});
