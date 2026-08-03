import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

/**
 * Ein @font-face, dessen Datei fehlt, wirft nichts — der Browser nimmt still
 * die Ersatzschrift. In canvas-editor/src/styles/typography.css zeigten die
 * Regeln fuer GrueneTypeNeue, GrueneType, PT Sans und Raleway auf `../fonts/`,
 * von src/styles/ aus also auf src/fonts/, wo nur die oesterreichischen
 * Schnitte lagen. Aufgefallen ist es erst an einem ausgelieferten Bild:
 * slider-preview.webp stand in Helvetica.
 *
 * Beide Schriftdeklarationen werden geprueft — die der Web-App war in Ordnung,
 * aber sie ist die Vorlage, aus der die andere kopiert wurde.
 */
const HIER = path.dirname(fileURLToPath(import.meta.url));

const DATEIEN = [
  path.resolve(HIER, '../typography.css'),
  path.resolve(HIER, '../../../../../apps/web/src/assets/styles/common/typography.css'),
];

/** Jeder url()-Wert einer @font-face-Regel, in Reihenfolge des Auftretens. */
function schriftpfade(css: string): string[] {
  return [...css.matchAll(/url\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]);
}

describe('Schriftpfade in den @font-face-Deklarationen', () => {
  it.each(DATEIEN)('%s verweist nur auf vorhandene Dateien', (datei) => {
    expect(existsSync(datei), `${datei} fehlt`).toBe(true);
    const pfade = schriftpfade(readFileSync(datei, 'utf8'));

    // Kein Treffer hiesse: der Ausdruck oben passt nicht mehr, und der Guard
    // waere ab sofort blind.
    expect(pfade.length).toBeGreaterThan(10);

    const fehlend = pfade.filter((p) => !existsSync(path.resolve(path.dirname(datei), p)));
    expect(fehlend, `nicht auflösbar: ${fehlend.join(', ')}`).toEqual([]);
  });

  it('das CSS-Bundle liegt so tief, dass dieselben Pfade dort auch gelten', () => {
    // tailwindcss inlined `@import` ohne die url()s umzuschreiben, das Bundle
    // erbt also die quell-relativen Pfade. Vorher stand die Ausgabe eine Ebene
    // hoeher als die Quelle: derselbe Pfad war entweder in der Quelle oder im
    // Bundle falsch, nie in beiden richtig. Geprueft wird ohne Build — nur die
    // Tiefe, die package.json konfiguriert.
    const paket = path.resolve(HIER, '../../..');
    const pkg = JSON.parse(readFileSync(path.join(paket, 'package.json'), 'utf8')) as {
      scripts: { 'build:css': string };
    };
    const ausgabe = /-o\s+(\S+)/.exec(pkg.scripts['build:css'])?.[1];
    expect(ausgabe, 'Ausgabepfad in build:css nicht gefunden').toBeTruthy();

    const quellTiefe = path.relative(paket, path.resolve(HIER, '..')).split(path.sep).length;
    const bundleTiefe = path
      .relative(paket, path.dirname(path.resolve(paket, ausgabe!)))
      .split(path.sep).length;
    expect(bundleTiefe).toBe(quellTiefe);
  });

  it('deckt in beiden Dateien dieselben Schriftfamilien ab', () => {
    // Die zwei Deklarationen sind handverdrahtete Geschwister. Laeuft eine
    // davon weg, rendert dieselbe Vorlage je nach Einstiegspunkt anders.
    const familien = (datei: string) =>
      [...readFileSync(datei, 'utf8').matchAll(/font-family:\s*'([^']+)'/g)]
        .map((m) => m[1])
        .filter((f, i, a) => a.indexOf(f) === i)
        .sort();

    expect(familien(DATEIEN[0])).toEqual(familien(DATEIEN[1]));
  });
});
