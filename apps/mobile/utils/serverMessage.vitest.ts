import { AxiosError } from 'axios';
import { describe, expect, it } from 'vitest';

import { serverMessage } from './serverMessage';

describe('serverMessage', () => {
  it('prefers the route message of an axios error', () => {
    const err = new AxiosError('Request failed', '403', undefined, undefined, {
      status: 403,
      data: { message: 'Nicht erlaubt.' },
    } as never);
    expect(serverMessage(err, 'x')).toBe('Nicht erlaubt.');
  });
  it('falls back for axios errors without a message', () => {
    expect(serverMessage(new AxiosError('boom'), 'Fallback')).toBe('Fallback');
  });
  it('uses the message of a plain error', () => {
    expect(serverMessage(new Error('Kaputt'), 'x')).toBe('Kaputt');
  });
});
