import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

/**
 * `--editor-text-muted` wird nur als Textfarbe benutzt (WCAG 1.4.3, 4.5:1) und
 * steht auf Fläche, Einsatz, Kachel und Hintergrund des Editors. Der Test
 * rechnet die Werte aus beiden variables.css selbst aus.
 */
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const DATEIEN = [
  'apps/web/src/assets/styles/common/variables.css',
  'packages/canvas-editor/src/styles/variables.css',
];
const FLAECHEN = ['--editor-bg', '--editor-surface', '--editor-inset', '--editor-tile'];

/** Deklarationen eines Blocks, der mit `kopf` beginnt (erste Klammerebene). */
function block(css: string, kopf: string, nth = 0): Map<string, string> {
  let von = -1;
  for (let i = 0; i <= nth; i++) von = css.indexOf(kopf, von + 1);
  if (von < 0) throw new Error(`Block ${kopf} fehlt`);
  const start = css.indexOf('{', von);
  let tiefe = 0;
  let ende = start;
  for (; ende < css.length; ende++) {
    if (css[ende] === '{') tiefe++;
    if (css[ende] === '}' && --tiefe === 0) break;
  }
  const m = new Map<string, string>();
  for (const t of css.slice(start + 1, ende).matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g))
    m.set(t[1]!, t[2]!.trim());
  return m;
}

function aufloesen(name: string, ...ebenen: Map<string, string>[]): string {
  let wert = name;
  for (let i = 0; i < 10; i++) {
    const v = /^var\((--[a-z0-9-]+)\)$/.exec(wert);
    if (!v) return wert;
    const naechster = ebenen.map((e) => e.get(v[1]!)).find((x) => x !== undefined);
    if (naechster === undefined) throw new Error(`${v[1]} nicht aufgelöst`);
    wert = naechster;
  }
  throw new Error('Zyklus');
}

function luminanz(hex: string): number {
  const h = hex.toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(h)) throw new Error(`kein Hex-Wert: ${hex}`);
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function kontrast(a: string, b: string): number {
  const [hell, dunkel] = [luminanz(a), luminanz(b)].sort((x, y) => y - x);
  return (hell! + 0.05) / (dunkel! + 0.05);
}

describe('--editor-text-muted Kontrast', () => {
  for (const datei of DATEIEN) {
    const css = readFileSync(path.join(REPO, datei), 'utf8');
    const hell = block(css, ':root');
    // apps/web hat den Dunkelblock zusätzlich als @media; beide müssen passen.
    const dunkelBloecke = [block(css, '[data-theme="dark"]')];
    if (css.includes('prefers-color-scheme: dark'))
      dunkelBloecke.push(block(css, ':root:not([data-theme="light"])'));

    const faelle: [string, Map<string, string>[]][] = [
      ['hell', [hell]],
      ...dunkelBloecke.map((d, i): [string, Map<string, string>[]] => [
        `dunkel${i ? ' (prefers-color-scheme)' : ''}`,
        [d, hell],
      ]),
    ];
    for (const [modus, ebenen] of faelle) {
      for (const flaeche of FLAECHEN) {
        it(`${datei} ${modus}: muted auf ${flaeche} ≥ 4.5`, () => {
          const text = aufloesen('var(--editor-text-muted)', ...ebenen);
          const grund = aufloesen(`var(${flaeche})`, ...ebenen);
          expect(kontrast(text, grund)).toBeGreaterThanOrEqual(4.5);
        });
      }
    }
  }
});
