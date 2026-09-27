/**
 * Der Fingerprint entscheidet, ob ein PDF ein zweites Mal ausgelesen wird —
 * also ob ein seitenweise abgerechneter OCR-Lauf anfällt. Festgehalten wird
 * deshalb genau das, was diese Entscheidung kippen kann:
 *   1. Nur byte-gleiche Dateien gelten als gleich; ein Punkt ohne gespeicherten
 *      `file_hash` (alle vor dieser Änderung indizierten) gilt als ungleich und
 *      wird einmal ausgelesen, statt für immer übersprungen zu werden.
 *   2. Fehlende Validatoren erzeugen keinen Header — ein `If-None-Match: null`
 *      beantworten manche Server mit 304 und wir würden die Datei nie wieder
 *      ansehen.
 */
import { describe, it, expect } from 'vitest';

import {
  conditionalHeaders,
  fingerprintResponse,
  hashBytes,
  isSameFile,
} from './binaryFingerprint.js';

const bytes = (s: string) => new TextEncoder().encode(s);

const responseWith = (headers: Record<string, string>) =>
  new Response(null, { headers }) as Response;

describe('hashBytes', () => {
  it('is stable and byte-sensitive', () => {
    expect(hashBytes(bytes('%PDF-1.4 hello'))).toBe(hashBytes(bytes('%PDF-1.4 hello')));
    expect(hashBytes(bytes('%PDF-1.4 hello'))).not.toBe(hashBytes(bytes('%PDF-1.4 hellp')));
  });
});

describe('fingerprintResponse', () => {
  it('carries the validators the server sent', () => {
    const fp = fingerprintResponse(bytes('pdf'), responseWith({ etag: '"abc"' }));
    expect(fp.file_hash).toBe(hashBytes(bytes('pdf')));
    expect(fp.source_etag).toBe('"abc"');
  });

  it('omits absent validators instead of storing null', () => {
    const fp = fingerprintResponse(bytes('pdf'), responseWith({}));
    expect('source_etag' in fp).toBe(false);
    expect('source_last_modified' in fp).toBe(false);
  });
});

describe('conditionalHeaders', () => {
  it('builds both validators from a stored payload', () => {
    expect(
      conditionalHeaders({
        source_etag: '"abc"',
        source_last_modified: 'Wed, 21 Oct 2026 07:28:00 GMT',
      })
    ).toEqual({
      'If-None-Match': '"abc"',
      'If-Modified-Since': 'Wed, 21 Oct 2026 07:28:00 GMT',
    });
  });

  it('is empty for a never-indexed URL and for empty-string validators', () => {
    expect(conditionalHeaders(null)).toEqual({});
    expect(conditionalHeaders({ source_etag: '' })).toEqual({});
  });
});

describe('isSameFile', () => {
  const fp = fingerprintResponse(bytes('pdf'), responseWith({}));

  it('matches only on an identical stored hash', () => {
    expect(isSameFile({ file_hash: fp.file_hash }, fp)).toBe(true);
    expect(isSameFile({ file_hash: 'deadbeef' }, fp)).toBe(false);
  });

  it('treats a point without a stored hash as unknown, not as unchanged', () => {
    expect(isSameFile({}, fp)).toBe(false);
    expect(isSameFile({ file_hash: '' }, fp)).toBe(false);
    expect(isSameFile(null, fp)).toBe(false);
  });
});
