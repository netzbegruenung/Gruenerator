import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

/**
 * Der Dark-Mode steht in variables.css zweimal: einmal unter
 * `[data-theme="dark"]` (explizite Wahl) und einmal unter
 * `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }`
 * (Voreinstellung „system"). Ein Token, das nur in einem der beiden Blöcke
 * steht, behält im anderen Pfad seinen Light-Wert — so entstanden #3334
 * (`--font-color-green` fehlte im Attribut-Block) und #3339 (die
 * `--color-collection-bundestag`-Paare fehlten im Media-Block). Die beiden
 * Pfade werden nie zusammen ausgeübt, darum bewacht dieser Test die Namen.
 */
const HIER = path.dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(path.join(HIER, 'variables.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Inhalt des Blocks, dessen `{` direkt auf `selektor` folgt. */
function blockNach(css: string, selektor: string): string {
  const start = css.indexOf(selektor);
  if (start === -1) throw new Error(`Selektor nicht gefunden: ${selektor}`);
  const auf = css.indexOf('{', start + selektor.length);
  let tiefe = 0;
  for (let i = auf; i < css.length; i++) {
    if (css[i] === '{') tiefe++;
    else if (css[i] === '}' && --tiefe === 0) return css.slice(auf + 1, i);
  }
  throw new Error(`Block nicht geschlossen: ${selektor}`);
}

function tokenNamen(block: string): Set<string> {
  return new Set([...block.matchAll(/(--[\w-]+)\s*:/g)].map(([, name]) => name));
}

describe('variables.css Dark-Mode-Blöcke', () => {
  it('deklarieren im Attribut- und im Media-Block dieselben Tokens', () => {
    const attribut = tokenNamen(blockNach(CSS, '[data-theme="dark"]'));
    const media = blockNach(CSS, '@media (prefers-color-scheme: dark)');
    const system = tokenNamen(blockNach(media, ':root:not([data-theme="light"])'));

    expect(
      [...attribut].filter((name) => !system.has(name)),
      'fehlt im @media (prefers-color-scheme: dark)-Block'
    ).toEqual([]);
    expect(
      [...system].filter((name) => !attribut.has(name)),
      'fehlt im [data-theme="dark"]-Block'
    ).toEqual([]);
  });
});
