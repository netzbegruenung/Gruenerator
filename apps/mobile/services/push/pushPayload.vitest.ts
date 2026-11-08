import { describe, expect, it } from 'vitest';

import { parsePushPayload, pushTargetOf, utf8Decode } from './pushPayload';

describe('parsePushPayload', () => {
  const sealedShape = {
    v: 1,
    id: 'n1',
    title: 'Anna hat Dich in „Wahlkampf" erwähnt',
    body: null,
    url: '/projekte/wahlkampf-ab12cd',
    collapse: null,
  };

  it('reads what the server seals', () => {
    expect(parsePushPayload(JSON.stringify(sealedShape))).toEqual({
      id: 'n1',
      title: sealedShape.title,
      body: null,
      url: '/projekte/wahlkampf-ab12cd',
      collapse: null,
    });
  });

  it('refuses a newer format, missing fields and garbage', () => {
    expect(parsePushPayload(JSON.stringify({ ...sealedShape, v: 2 }))).toBeNull();
    expect(parsePushPayload(JSON.stringify({ ...sealedShape, title: '' }))).toBeNull();
    expect(parsePushPayload('not json')).toBeNull();
    expect(parsePushPayload('null')).toBeNull();
  });
});

describe('utf8Decode', () => {
  it('decodes umlauts, typographic quotes and emoji', () => {
    const text = 'Grüne „Plakate" 🌻';
    expect(utf8Decode(new TextEncoder().encode(text))).toBe(text);
  });
});

describe('pushTargetOf', () => {
  it('routes a tapped push by its url', () => {
    expect(pushTargetOf({ url: '/chat/t1', id: 'n1' })).toEqual({ url: '/chat/t1', id: 'n1' });
  });

  it('ignores local notifications without a url (subtitle export)', () => {
    expect(pushTargetOf({})).toBeNull();
    expect(pushTargetOf(null)).toBeNull();
    expect(pushTargetOf({ url: '' })).toBeNull();
  });
});
