/**
 * Der Wächter, der #3043 schließt.
 *
 * Die Fälle sind nicht erfunden, sondern die vier Pfadquellen aus dem Issue:
 * `?path=` aus einer Query, `filePath` aus einem Request-Body, ein `path` aus
 * einem `@wolke`-Erwähnungstoken und einer aus einer Modellantwort. Was sie
 * eint: keine davon ist vom Server geschrieben.
 */
import { describe, expect, it } from 'vitest';

import { CloudPathError, assertNoPathEscape, assertRootRelativePath } from './cloudPaths.js';

const PREFIX = '/public.php/webdav';

describe('assertNoPathEscape', () => {
  const escapes = [
    '../../secrets',
    'A/../../secrets',
    `${PREFIX}/../../remote.php/dav`,
    // Kodiert ist derselbe Angriff: der rohe Zweig von `downloadFile` reicht
    // einen Pfad mit WebDAV-Präfix unverändert weiter.
    '%2e%2e/secrets',
    `${PREFIX}/%2e%2e/%2e%2e/remote.php/dav`,
    // Ein kodierter TRENNER hielt die Punkt-Segmente zusammen: roh getrennt ist
    // `..%2f..%2fremote.php` EIN Segment, das zu `../../remote.php` dekodiert
    // und damit nicht gleich `..` ist. Erreichbar über POST /api/docs/from-wolke,
    // dessen `filePath` roh in den WebDAV-Präfix-Zweig von `downloadFile` geht,
    // wo Prozent-Kodierung bis auf die Leitung überlebt.
    `${PREFIX}/..%2f..%2fremote.php/dav`,
    '..%2f..%2fsecrets',
    '..%5c..%5csecrets',
    '%2e%2e%2f%2e%2e%2fsecrets',
    'A/..%2F..%2Fsecrets',
    // Zweifach kodiert — erst nach zweimaligem Auflösen steht `..` da.
    '%252e%252e/secrets',
    'A\\..\\..\\secrets',
    '..',
    'https://evil.example/x',
    '//evil.example/x',
  ];

  for (const bad of escapes) {
    it(`refuses "${bad}"`, () => {
      expect(() => assertNoPathEscape(bad)).toThrow(CloudPathError);
    });
  }

  const fine = [
    '',
    'A/B',
    '/A/B/',
    `${PREFIX}/Antr%C3%A4ge/rede.pdf`,
    // Punkte IM Namen sind keine Punkt-Segmente — die Prüfung sitzt auf dem
    // Segment, nicht auf dem String, sonst verlöre sie gewöhnliche Dateien.
    'Bericht..2026.pdf',
    'A/.hidden/x.md',
    './A/B',
    // Ein kaputtes Escape darf keine gewöhnliche Datei kosten — und es darf
    // auch nicht die Prüfung der ÜBRIGEN Segmente abwürgen, weshalb pro
    // Segment dekodiert wird und nicht über den ganzen Pfad.
    '100%betreuung/rede.pdf',
    'Antr%C3%A4ge/rede.pdf',
    // Ein kodierter Trenner ohne Punkt-Segment ist harmlos.
    'Sitzung%2F2026.pdf',
  ];

  for (const good of fine) {
    it(`lets "${good}" through`, () => {
      expect(() => assertNoPathEscape(good)).not.toThrow();
    });
  }

  it('leaves the path untouched — it checks, it does not repair', () => {
    // Die Transportschicht braucht den Pfad in genau der Form, in der er
    // hereinkam: prozent-kodiert und mit Präfix entscheidet er in
    // `downloadFile` über den rohen gegen den kodierenden Zweig. Eine
    // Normalisierung hier würde doppelt kodieren.
    expect(assertNoPathEscape(`${PREFIX}/Antr%C3%A4ge/x.pdf`)).toBeUndefined();
  });
});

describe('assertRootRelativePath', () => {
  it('drops leading, trailing and doubled separators', () => {
    expect(assertRootRelativePath('/A//B/')).toBe('A/B');
  });

  it('drops a single-dot segment', () => {
    expect(assertRootRelativePath('./A/./B')).toBe('A/B');
  });

  it('reads an empty path as the root', () => {
    expect(assertRootRelativePath('')).toBe('');
    expect(assertRootRelativePath(null)).toBe('');
  });

  it('refuses what assertNoPathEscape refuses, rather than repairing it', () => {
    // Der eigentliche Punkt: ein bereinigter Pfad läse einen ANDEREN Ordner
    // als den benannten und sähe dabei wie ein Erfolg aus.
    expect(() => assertRootRelativePath('A/../../secrets')).toThrow(CloudPathError);
  });
});
