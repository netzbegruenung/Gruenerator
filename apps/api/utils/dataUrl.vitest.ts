import { describe, expect, it } from 'vitest';

import { decodeBase64OrDataUrl, decodeDataUrl } from './dataUrl.js';

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const PNG_BASE64 = PNG_BYTES.toString('base64');
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`;

/** Groessenordnung des Bugs: 5,5-MB-JPEG als Data-URL (7,4 MB String). */
const HUGE_BYTES = Buffer.alloc(5_542_113, 0x42);

describe('decodeDataUrl', () => {
  it('dekodiert zu Buffer und Medientyp', () => {
    const decoded = decodeDataUrl(PNG_DATA_URL);

    expect(decoded?.mediaType).toBe('image/png');
    expect(decoded?.buffer.equals(PNG_BYTES)).toBe(true);
  });

  it('gibt null fuer rohes base64 ohne Header', () => {
    expect(decodeDataUrl(PNG_BASE64)).toBeNull();
  });

  it('gibt null fuer eine kaputte Data-URL', () => {
    expect(decodeDataUrl('data:image/png,nope')).toBeNull();
  });

  it('lehnt den falschen Medientyp ab', () => {
    expect(
      decodeDataUrl('data:application/pdf;base64,JVBER', { expectedType: 'image' })
    ).toBeNull();
    expect(decodeDataUrl(PNG_DATA_URL, { expectedType: 'image' })).not.toBeNull();
  });

  it('lehnt zu grosse Payloads ab, bevor der Buffer entsteht', () => {
    expect(decodeDataUrl(PNG_DATA_URL, { maxBytes: 2 })).toBeNull();
    expect(decodeDataUrl(PNG_DATA_URL, { maxBytes: PNG_BYTES.length })).not.toBeNull();
  });

  it('dekodiert 5,5 MB ohne RangeError', () => {
    const url = `data:image/jpeg;base64,${HUGE_BYTES.toString('base64')}`;

    const decoded = decodeDataUrl(url, { expectedType: 'image' });

    expect(decoded?.mediaType).toBe('image/jpeg');
    expect(decoded?.buffer.length).toBe(HUGE_BYTES.length);
  });
});

describe('decodeBase64OrDataUrl', () => {
  it('nimmt rohes base64 mit Fallback-Medientyp', () => {
    const decoded = decodeBase64OrDataUrl(PNG_BASE64, 'image/png');

    expect(decoded?.mediaType).toBe('image/png');
    expect(decoded?.buffer.equals(PNG_BYTES)).toBe(true);
  });

  it('bevorzugt den Medientyp aus der Data-URL', () => {
    expect(decodeBase64OrDataUrl(PNG_DATA_URL, 'image/jpeg')?.mediaType).toBe('image/png');
  });

  it('gibt null fuer eine kaputte Data-URL, statt sie als base64 zu lesen', () => {
    // Sonst landet der Header selbst im Buffer — der alte replace()-Pfad tat das.
    expect(decodeBase64OrDataUrl('data:image/png,nope', 'image/png')).toBeNull();
  });
});
