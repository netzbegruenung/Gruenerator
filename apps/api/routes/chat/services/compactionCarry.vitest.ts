/**
 * Die Auswahlregel, nicht die Formatierung: WELCHER Text die Kürzung überlebt,
 * und — wichtiger — wann bewusst keiner mitgenommen wird.
 */
import { describe, it, expect } from 'vitest';

import { renderCarryBlock, selectCarriedLongForm } from './compactionCarry.js';

const long = (marker: string, chars = 2000): string =>
  `${marker} `.repeat(Math.ceil(chars / (marker.length + 1)));

const assistant = (text: string) => ({ role: 'assistant', content: text });
const user = (text: string) => ({ role: 'user', content: text });

describe('selectCarriedLongForm', () => {
  it('rettet den jüngsten Langtext aus dem weggeschnittenen Teil', () => {
    const dropped = [
      user('Schreib eine PM zu Solarenergie'),
      assistant(long('ERSTE-FASSUNG')),
      user('Kürzer bitte'),
      assistant(long('ZWEITE-FASSUNG')),
      user('Danke'),
    ];
    const kept = [assistant('Gern!'), user('Wie war das Wetter?')];

    const carried = selectCarriedLongForm(dropped, kept);
    expect(carried).toContain('ZWEITE-FASSUNG');
    expect(carried).not.toContain('ERSTE-FASSUNG');
  });

  it('nimmt nichts mit, solange im Fenster noch ein Langtext steht', () => {
    // Der Normalfall „PM schreiben, dann ändern": die aktuelle Fassung ist
    // ohnehin da, ein älterer Entwurf daneben wäre nur verwechselbar.
    const dropped = [assistant(long('ALTE-FASSUNG'))];
    const kept = [user('Nochmal kürzer'), assistant(long('NEUE-FASSUNG'))];

    expect(selectCarriedLongForm(dropped, kept)).toBeNull();
  });

  it('hält kurze Antworten für Gesprächsverlauf, nicht für Ergebnisse', () => {
    const dropped = [assistant('Klar, mache ich.'), assistant('Fertig.')];
    expect(selectCarriedLongForm(dropped, [user('Weiter')])).toBeNull();
  });

  it('ignoriert lange NUTZER-Nachrichten (eingefügter Artikel ist kein Ergebnis)', () => {
    const dropped = [user(long('EINGEFUEGTER-ARTIKEL'))];
    expect(selectCarriedLongForm(dropped, [user('Und jetzt?')])).toBeNull();
  });

  it('liest Text auch aus einem Parts-Array', () => {
    const dropped = [
      {
        role: 'assistant',
        content: [
          { type: 'reasoning', text: 'egal' },
          { type: 'text', text: long('AUS-PARTS') },
        ],
      },
    ];
    expect(selectCarriedLongForm(dropped, [user('Weiter')])).toContain('AUS-PARTS');
  });

  it('kippt nicht an Inhalten ohne Text (null, Objekt, Bildteile)', () => {
    const dropped = [
      { role: 'assistant', content: null },
      { role: 'assistant' },
      { role: 'assistant', content: { unerwartet: true } },
      { role: 'assistant', content: [{ type: 'image', image: 'data:…' }] },
    ];
    expect(() => selectCarriedLongForm(dropped, [])).not.toThrow();
    expect(selectCarriedLongForm(dropped, [])).toBeNull();
  });

  it('kürzt einen übergrossen Text und markiert die Kürzung', () => {
    const huge = long('SEHR-LANG', 40_000);
    const carried = selectCarriedLongForm([assistant(huge)], [user('Weiter')]);
    expect(carried).not.toBeNull();
    expect(carried!.length).toBeLessThan(huge.length);
    expect(carried).toContain('gekürzt');
  });

  it('gibt null zurück, wenn nichts weggeschnitten wurde', () => {
    expect(selectCarriedLongForm([], [assistant('kurz')])).toBeNull();
  });
});

describe('renderCarryBlock', () => {
  it('trägt den Text wörtlich und sagt, dass er schon existiert', () => {
    const block = renderCarryBlock('PRESSEMITTEILUNG-TEXT');
    expect(block).toContain('PRESSEMITTEILUNG-TEXT');
    expect(block).toContain('WÖRTLICH');
    expect(block).toMatch(/nicht ungefragt neu/);
  });
});
