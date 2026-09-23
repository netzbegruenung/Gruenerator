import { describe, expect, it } from 'vitest';

import {
  decodedByteLength,
  extractBase64,
  isDataUrl,
  parseDataUrl,
  stripDataUrlPrefix,
} from './dataUrl.js';

/**
 * Ein Payload in der Groessenordnung, die den Bug ausgeloest hat: das
 * AI-Sharepic reichte ein 5,5-MB-JPEG als 7,4-MB-Data-URL durch. Jede Assertion
 * auf blosse Korrektheit haette den alten `(.+)$`-Regex gruen gemeldet — der
 * Fehler haengt an der Groesse, also muss die Groesse im Test stehen.
 */
const HUGE_PAYLOAD = 'A'.repeat(7_400_000);

describe('parseDataUrl', () => {
  it('zerlegt eine einfache Data-URL', () => {
    expect(parseDataUrl('data:image/png;base64,aGVsbG8=')).toEqual({
      mediaType: 'image/png',
      base64: 'aGVsbG8=',
    });
  });

  it('ignoriert Parameter zwischen Medientyp und base64-Marker', () => {
    expect(parseDataUrl('data:image/svg+xml;charset=utf-8;base64,PHN2Zz4=')).toEqual({
      mediaType: 'image/svg+xml',
      base64: 'PHN2Zz4=',
    });
  });

  it('normalisiert den Medientyp auf Kleinschreibung', () => {
    expect(parseDataUrl('data:IMAGE/JPEG;base64,QQ==')?.mediaType).toBe('image/jpeg');
  });

  it('faellt ohne Medientyp auf text/plain zurueck', () => {
    expect(parseDataUrl('data:;base64,QQ==')?.mediaType).toBe('text/plain');
  });

  it.each([
    ['kein Data-URL-Praefix', 'aGVsbG8='],
    ['fehlender base64-Marker', 'data:image/png,PHN2Zz4='],
    ['url-kodiert statt base64', 'data:text/plain;charset=utf-8,hallo'],
    ['leerer Payload', 'data:image/png;base64,'],
    ['unplausibler Medientyp', 'data:not-a-mime;base64,QQ=='],
    ['leerer String', ''],
  ])('gibt null zurueck: %s', (_label, input) => {
    expect(parseDataUrl(input)).toBeNull();
  });

  it('erkennt einen ueberlangen Header nicht als Data-URL', () => {
    // Der Marker liegt jenseits des Prefix-Fensters — bewusst kein Treffer,
    // sonst waere das Fenster wirkungslos.
    const bloatedHeader = `data:image/png;${'x=1;'.repeat(100)}base64,QQ==`;
    expect(parseDataUrl(bloatedHeader)).toBeNull();
  });
});

describe('parseDataUrl bei Payloads in Megabyte-Groesse', () => {
  it('parst 7,4 MB ohne RangeError', () => {
    const url = `data:image/jpeg;base64,${HUGE_PAYLOAD}`;

    const parsed = parseDataUrl(url);

    expect(parsed?.mediaType).toBe('image/jpeg');
    expect(parsed?.base64.length).toBe(HUGE_PAYLOAD.length);
    expect(parsed?.base64).toBe(HUGE_PAYLOAD);
  });

  it('bleibt konstant schnell — der Payload wird nicht gescannt', () => {
    const huge = `data:image/jpeg;base64,${HUGE_PAYLOAD}`;

    // Minimum ueber mehrere Runden: Last auf dem Runner (GC, Preemption) kann
    // eine Messung nur verlaengern, nie verkuerzen. Die erste Runde traegt
    // auch den First Touch des 7,4-MB-Strings und faellt damit heraus.
    const fastestOf = (run: () => void): number => {
      let best = Number.POSITIVE_INFINITY;
      for (let round = 0; round < 5; round++) {
        const started = performance.now();
        run();
        best = Math.min(best, performance.now() - started);
      }
      return best;
    };

    // Referenz ist EIN Durchlauf ueber den Payload auf demselben Runner — die
    // billigste Form von Scan (SIMD-`indexOf`, ~0,1 ms lokal; die alte
    // `(.+)$`-Variante braucht ~1,8 ms pro Aufruf). Frueher stand hier ein
    // Quotient gegen 50 Parses eines 1-kB-Payloads: die liegen unter der
    // Timer-Aufloesung, die Basis war also die 0,1-ms-Klemme und das Budget
    // eine feste Wanduhr-Zeit (#3457).
    const scanMs = fastestOf(() => huge.indexOf('!'));
    const parseMs = fastestOf(() => {
      for (let i = 0; i < 10; i++) parseDataUrl(huge);
    });

    expect(parseMs).toBeLessThan(scanMs);
  });
});

describe('extractBase64', () => {
  it('gibt rohes base64 unveraendert zurueck', () => {
    expect(extractBase64('aGVsbG8=')).toBe('aGVsbG8=');
  });

  it('schneidet den Header ab', () => {
    expect(extractBase64('data:image/png;base64,aGVsbG8=')).toBe('aGVsbG8=');
  });

  it('wirft bei kaputter Data-URL', () => {
    expect(() => extractBase64('data:image/png,nope')).toThrow('Invalid data URL format');
  });

  it('verarbeitet 7,4 MB ohne RangeError', () => {
    expect(extractBase64(`data:image/jpeg;base64,${HUGE_PAYLOAD}`).length).toBe(
      HUGE_PAYLOAD.length
    );
  });
});

describe('stripDataUrlPrefix', () => {
  it('schneidet den Header ab', () => {
    expect(stripDataUrlPrefix('data:image/png;base64,aGVsbG8=')).toBe('aGVsbG8=');
  });

  it('laesst rohes base64 stehen', () => {
    expect(stripDataUrlPrefix('aGVsbG8=')).toBe('aGVsbG8=');
  });

  it('laesst eine kaputte Data-URL unveraendert, statt zu werfen', () => {
    // Bewusst nachsichtig: das war das Verhalten der replace()-Einzeiler, die
    // hierdurch ersetzt wurden.
    expect(stripDataUrlPrefix('data:image/png,nope')).toBe('data:image/png,nope');
  });

  it('greift auch bei svg+xml, wo das alte \\w+ danebengriff', () => {
    expect(stripDataUrlPrefix('data:image/svg+xml;base64,PHN2Zz4=')).toBe('PHN2Zz4=');
  });

  it('verarbeitet 7,4 MB ohne RangeError', () => {
    expect(stripDataUrlPrefix(`data:image/jpeg;base64,${HUGE_PAYLOAD}`).length).toBe(
      HUGE_PAYLOAD.length
    );
  });
});

describe('decodedByteLength', () => {
  it.each([
    ['', 0],
    ['QQ==', 1],
    ['QUE=', 2],
    ['QUJD', 3],
  ])('rechnet %s auf %i Bytes', (base64, expected) => {
    expect(decodedByteLength(base64)).toBe(expected);
  });

  it('entspricht der tatsaechlichen Groesse', () => {
    const base64 = Buffer.from('Grünerator-Testinhalt mit Umlauten').toString('base64');
    expect(decodedByteLength(base64)).toBe(Buffer.from(base64, 'base64').length);
  });
});

describe('isDataUrl', () => {
  it.each([
    ['data:image/png;base64,QQ==', true],
    ['data:', true],
    ['https://example.org/bild.png', false],
    ['QQ==', false],
  ])('%s -> %s', (input, expected) => {
    expect(isDataUrl(input)).toBe(expected);
  });
});
