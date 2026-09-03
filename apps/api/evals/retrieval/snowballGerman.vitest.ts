import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { snowballGerman } from './snowballGerman.js';

/**
 * Die Fixture ist jedes 25. Wortpaar aus `snowball-data/german`
 * (`voc.txt`/`output.txt`, abgerufen 04.09.2026) — 1403 von 35 053.
 *
 * Gegen die VOLLE Liste läuft die Implementierung ebenfalls ohne einen
 * einzigen Unterschied; nachgemessen am 04.09.2026, und der Grund, warum
 * `natural`s `PorterStemmerDe` hier nicht benutzt wird (1265 Abweichungen,
 * 3,61 %). Die Stichprobe steht im Repo statt der Vollliste, weil 26 KB als
 * Wächter reichen und 700 KB nicht mehr gelesen werden.
 *
 * Nachfahren der Vollprüfung:
 *   curl -sO https://raw.githubusercontent.com/snowballstem/snowball-data/master/german/voc.txt
 *   curl -sO https://raw.githubusercontent.com/snowballstem/snowball-data/master/german/output.txt
 */
const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), 'snowball-german-sample.txt');

const PAIRS: Array<[string, string]> = readFileSync(FIXTURE, 'utf8')
  .split('\n')
  .filter((line) => line.length > 0)
  .map((line) => {
    const [word, stem] = line.split('\t');
    return [word, stem];
  });

describe('snowballGerman', () => {
  it('reproduces the official Snowball output for every sampled word', () => {
    expect(PAIRS.length).toBe(1403);
    const wrong = PAIRS.filter(([word, stem]) => snowballGerman(word) !== stem).map(
      ([word, stem]) => `${word}: expected ${stem}, got ${snowballGerman(word)}`
    );
    expect(wrong).toEqual([]);
  });

  it('strips the participle -et that natural PorterStemmerDe leaves standing', () => {
    // Die systematische Abweichung, wegen der das Paket ausschied.
    expect(snowballGerman('abgeleitet')).toBe('abgeleit');
    expect(snowballGerman('abgewirtschaftet')).toBe('abgewirtschaft');
  });

  it('keeps the words the -et rule exempts', () => {
    // `not among ('geordn' 'intern' 'plan' 'tick' 'tr')` in german.sbl.
    expect(snowballGerman('Planet')).toBe('planet');
    expect(snowballGerman('Ticket')).toBe('ticket');
    expect(snowballGerman('Internet')).toBe('internet');
  });

  it('is case-insensitive and idempotent on its own output', () => {
    for (const word of ['Bebauungsplanverfahren', 'Wärmeplanungsgesetz', 'Erhaltungssatzung']) {
      const stem = snowballGerman(word);
      expect(snowballGerman(word.toUpperCase())).toBe(stem);
      expect(snowballGerman(stem)).toBe(stem);
    }
  });
});
