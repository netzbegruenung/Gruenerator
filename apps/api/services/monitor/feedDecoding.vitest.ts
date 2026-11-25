/**
 * Charset-Erkennung + Entity-Fix für RSS-Feeds (#6078).
 *
 * Fixtures: nachrichten.at liefert `application/xml` ohne charset mit
 * `encoding='ISO-8859-15'` (live geprüft 25.11.2026); ndr.de/tagesspiegel.de
 * doppelt-escapte Entities in Titeln.
 *
 * Run: `npx vitest run services/monitor/feedDecoding.vitest.ts`
 */
import { describe, expect, it } from 'vitest';

import {
  charsetFromContentType,
  charsetFromXmlDeclaration,
  decodeFeedBytes,
  fixDoubleEscapedEntities,
} from './feedDecoding.js';

/** Bytes für Zeichen im latin1-Bereich — für Umlaute identisch zu ISO-8859-15. */
function latin1Bytes(s: string): Uint8Array {
  return Uint8Array.from(s, (c) => c.codePointAt(0)!);
}

describe('charsetFromContentType', () => {
  it('liest den charset-Parameter', () => {
    expect(charsetFromContentType('text/xml; charset=UTF-8')).toBe('UTF-8');
    expect(charsetFromContentType('application/xml; charset="iso-8859-15"')).toBe('iso-8859-15');
  });

  it('ist null ohne Parameter', () => {
    expect(charsetFromContentType('application/xml')).toBeNull();
    expect(charsetFromContentType(null)).toBeNull();
  });
});

describe('charsetFromXmlDeclaration', () => {
  it('liest single- und double-quoted Deklarationen', () => {
    expect(
      charsetFromXmlDeclaration(latin1Bytes(`<?xml version="1.0" encoding='ISO-8859-15'?>`))
    ).toBe('ISO-8859-15');
    expect(charsetFromXmlDeclaration(latin1Bytes(`<?xml version="1.0" encoding="UTF-8"?>`))).toBe(
      'UTF-8'
    );
  });

  it('ist null ohne Deklaration', () => {
    expect(charsetFromXmlDeclaration(latin1Bytes('<rss version="2.0">'))).toBeNull();
  });
});

describe('decodeFeedBytes', () => {
  it('dekodiert ISO-8859-15 aus der XML-Deklaration (nachrichten.at, content-type ohne charset)', () => {
    const xml = latin1Bytes(
      `<?xml version="1.0" encoding='ISO-8859-15'?><rss><title>Ärztekammer macht gegen Gesundheitsreform mobil, größer</title></rss>`
    );
    const decoded = decodeFeedBytes(xml, 'application/xml');
    expect(decoded).toContain('Ärztekammer macht gegen Gesundheitsreform mobil, größer');
    expect(decoded).not.toContain('�');
  });

  it('unterscheidet ISO-8859-15 von latin1 (0xA4 ist das Euro-Zeichen, in latin1 ¤)', () => {
    // latin1Bytes('<?xml encoding="ISO-8859-15"?>') + 0xA4
    const xml = Uint8Array.of(...latin1Bytes('<?xml encoding="ISO-8859-15"?>'), 0xa4);
    expect(decodeFeedBytes(xml, 'application/xml')).toContain('€');
  });

  it('priorisiert den Content-Type-charset vor der Deklaration', () => {
    const xml = new TextEncoder().encode(
      `<?xml version="1.0" encoding="ISO-8859-15"?><rss><title>Österreich</title></rss>`
    );
    // Bytes sind echtes UTF-8, Deklaration lügt → Content-Type gewinnt
    expect(decodeFeedBytes(xml, 'text/xml; charset=UTF-8')).toContain('Österreich');
  });

  it('fällt auf UTF-8 zurück ohne jeglichen Hinweis', () => {
    const xml = new TextEncoder().encode(
      '<rss><title>Statistik Austria: Österreichs Bevölkerung</title></rss>'
    );
    expect(decodeFeedBytes(xml, 'application/xml')).toContain('Österreichs Bevölkerung');
  });

  it('fällt bei unbekanntem Charset-Label auf UTF-8 zurück statt zu werfen', () => {
    const xml = new TextEncoder().encode('<rss><title>Grüße</title></rss>');
    expect(decodeFeedBytes(xml, 'application/xml; charset=x-bogus')).toContain('Grüße');
  });

  it('entfernt ein UTF-8-BOM', () => {
    const xml = Uint8Array.of(
      0xef,
      0xbb,
      0xbf,
      ...new TextEncoder().encode('<?xml version="1.0"?><rss/>')
    );
    expect(decodeFeedBytes(xml, null).startsWith('<?xml')).toBe(true);
  });
});

describe('fixDoubleEscapedEntities', () => {
  it('dekodiert doppelt-escapte Named Entities (ndr.de: &amp;amp;)', () => {
    expect(fixDoubleEscapedEntities('Lennart Meyer &amp; PEACE')).toBe('Lennart Meyer & PEACE');
  });

  it('dekodiert doppelt-escapte numerische Referenzen (tagesspiegel.de: &amp;#x26;)', () => {
    expect(fixDoubleEscapedEntities('Park&#x26;Ride')).toBe('Park&Ride');
    expect(fixDoubleEscapedEntities('&#65;&#66;')).toBe('AB');
  });

  it('lässt bereits dekodierte Titel unangetastet', () => {
    expect(fixDoubleEscapedEntities('AT&T')).toBe('AT&T');
    expect(fixDoubleEscapedEntities('§ 87f UrhG')).toBe('§ 87f UrhG');
    expect(fixDoubleEscapedEntities('Grüne & Faire Politik')).toBe('Grüne & Faire Politik');
  });

  it('dekodiert gemischte Referenzen in einem Durchgang', () => {
    expect(fixDoubleEscapedEntities('a &amp; b &lt; c &gt; d')).toBe('a & b < c > d');
  });
});
