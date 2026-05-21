import { describe, it, expect } from 'vitest';

import { isRecoverableError } from './searchRetryStrategy.js';

describe('isRecoverableError', () => {
  it('treats AbortError ("operation was aborted") as recoverable', () => {
    // Linkup's deep-research deadline surfaces as an AbortError; before this it
    // fell through to the non-recoverable default and never retried/fell back.
    expect(isRecoverableError(new Error('This operation was aborted'))).toBe(true);
    expect(isRecoverableError(new Error('The operation was aborted due to timeout'))).toBe(true);
  });

  it('treats timeouts and connection resets as recoverable', () => {
    expect(isRecoverableError(new Error('Request timed out'))).toBe(true);
    expect(isRecoverableError(new Error('ETIMEDOUT'))).toBe(true);
    expect(isRecoverableError(new Error('ECONNRESET'))).toBe(true);
  });

  it('treats 5xx as recoverable, 4xx as non-recoverable', () => {
    expect(isRecoverableError(new Error('502 Bad Gateway'))).toBe(true);
    expect(isRecoverableError(new Error('Request failed with status 401'))).toBe(false);
  });

  it('defaults unknown errors to non-recoverable', () => {
    expect(isRecoverableError(new Error('something weird happened'))).toBe(false);
  });
});
