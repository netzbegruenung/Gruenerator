import { describe, expect, it } from 'vitest';

import { parseWebViewMessage } from './webviewBridge.js';

describe('parseWebViewMessage', () => {
  it('accepts the two known messages as JSON strings', () => {
    expect(parseWebViewMessage(JSON.stringify({ type: 'CLOSE' }))).toEqual({ type: 'CLOSE' });
    expect(parseWebViewMessage(JSON.stringify({ type: 'SESSION_LOST' }))).toEqual({
      type: 'SESSION_LOST',
    });
  });

  it('accepts already-parsed objects', () => {
    expect(parseWebViewMessage({ type: 'CLOSE' })).toEqual({ type: 'CLOSE' });
  });

  it('drops unknown extra fields rather than passing them through', () => {
    // The host must never forward page-supplied data it did not ask for.
    expect(parseWebViewMessage({ type: 'CLOSE', payload: { evil: true } })).toEqual({
      type: 'CLOSE',
    });
  });

  it.each([
    ['not json at all', 'unparseable string'],
    ['{"type":"NAVIGATE","url":"https://evil.com"}', 'unknown message type'],
    ['{"type":123}', 'non-string type'],
    ['null', 'json null'],
    ['[]', 'json array is not an object with a type'],
  ])('rejects %j — %s', (input) => {
    expect(parseWebViewMessage(input)).toBeNull();
  });

  it.each([[null], [undefined], [42], [{}], [{ type: undefined }]])(
    'rejects the non-message value %j',
    (input) => {
      expect(parseWebViewMessage(input)).toBeNull();
    }
  );
});
