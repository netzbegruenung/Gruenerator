/**
 * Was ein Gerät entschlüsseln muss: Nonce 12 ‖ Chiffretext ‖ Tag 16, base64 —
 * das „combined"-Format, das CryptoKit (iOS-Extension) und expo-crypto
 * (Android-Task) öffnen.
 */
import { createDecipheriv, randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { buildPlaintext, collapseIdFor, sealForDevice, type PushPlaintext } from './pushCrypto.js';

function open(key: Buffer, sealed: string): PushPlaintext {
  const raw = Buffer.from(sealed, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(raw.length - 16));
  const plain = Buffer.concat([
    decipher.update(raw.subarray(12, raw.length - 16)),
    decipher.final(),
  ]);
  return JSON.parse(plain.toString('utf8')) as PushPlaintext;
}

const notification = {
  id: 'n1',
  title: 'Anna hat Dich in „Wahlkampf" erwähnt',
  body: 'Kannst Du bis Freitag die Plakate prüfen?',
  action_url: '/projekte/wahlkampf-ab12cd',
};

describe('sealForDevice', () => {
  it('round-trips through the combined format', () => {
    const key = randomBytes(32);
    const plaintext = buildPlaintext(notification, 'c0ffee');
    const sealed = sealForDevice(key, plaintext);
    const raw = Buffer.from(sealed, 'base64');
    expect(raw.length).toBe(12 + Buffer.byteLength(JSON.stringify(plaintext)) + 16);
    expect(open(key, sealed)).toEqual(plaintext);
  });

  it('uses a fresh nonce per push', () => {
    const key = randomBytes(32);
    const plaintext = buildPlaintext(notification, null);
    expect(sealForDevice(key, plaintext)).not.toBe(sealForDevice(key, plaintext));
  });

  it('cannot be opened with another device key', () => {
    const sealed = sealForDevice(randomBytes(32), buildPlaintext(notification, null));
    expect(() => open(randomBytes(32), sealed)).toThrow();
  });
});

describe('buildPlaintext', () => {
  it('clips long text by code points so the payload stays far below 4 KB', () => {
    const long = buildPlaintext(
      { ...notification, title: '🌻'.repeat(500), body: 'ä'.repeat(5000) },
      collapseIdFor(randomBytes(32), 'group:g1')
    );
    expect(Array.from(long.title)).toHaveLength(100);
    expect(long.title.endsWith('…')).toBe(true);
    expect(Array.from(long.body ?? '')).toHaveLength(200);
    const sealed = sealForDevice(randomBytes(32), long);
    expect(sealed.length).toBeLessThan(1500);
  });

  it('keeps short text and a null body as they are', () => {
    const p = buildPlaintext({ ...notification, body: null }, null);
    expect(p).toEqual({
      v: 1,
      id: 'n1',
      title: notification.title,
      body: null,
      url: notification.action_url,
      collapse: null,
    });
  });
});

describe('collapseIdFor', () => {
  it('is stable per device but differs between devices of one project', () => {
    const a = randomBytes(32);
    const b = randomBytes(32);
    expect(collapseIdFor(a, 'group:g1')).toBe(collapseIdFor(a, 'group:g1'));
    expect(collapseIdFor(a, 'group:g1')).not.toBe(collapseIdFor(b, 'group:g1'));
    expect(collapseIdFor(a, 'group:g1')).toMatch(/^[0-9a-f]{32}$/);
  });
});
