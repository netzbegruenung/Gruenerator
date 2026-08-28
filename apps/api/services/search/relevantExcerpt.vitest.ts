/**
 * Was hier bewacht wird, ist die Aussage aus #2824: ein Positionsschnitt
 * beurteilt Seitenköpfe. Die Fälle sind entlang der Vertragspunkte gebaut —
 * wann `null` (und damit der alte Schnitt) die richtige Antwort ist, und wann
 * nicht.
 */
import { describe, expect, it } from 'vitest';

import { selectRelevantExcerpt } from './relevantExcerpt.js';

/** Ein Dokument, dessen Antwort weit hinten steht — die Bauform aus dem Befund. */
function documentWithAnswerAtEnd(): string {
  const header = Array.from(
    { length: 12 },
    (_, i) =>
      `## Abschnitt ${i + 1}\n\nAllgemeine Ausführungen zur Verwaltung und zum Verfahren. ` +
      `Dieser Absatz beschreibt Zuständigkeiten und Zeitpläne im Detail.`
  ).join('\n\n');
  const answer =
    '## Löschfristen\n\nDie Löschfristen betragen für Bewerbungsunterlagen sechs Monate, ' +
    'für Vertragsdaten zehn Jahre. Weitere Löschfristen gelten für Protokolldaten.';
  return `${header}\n\n${answer}`;
}

describe('selectRelevantExcerpt — wann es sich heraushält', () => {
  it('gibt null zurück, wenn der Text ohnehin ins Fenster passt', () => {
    expect(selectRelevantExcerpt('kurz', 'Löschfristen', 500)).toBeNull();
  });

  it('gibt null zurück ohne Anfrage', () => {
    const text = documentWithAnswerAtEnd();
    expect(selectRelevantExcerpt(text, '', 400)).toBeNull();
    expect(selectRelevantExcerpt(text, null, 400)).toBeNull();
    expect(selectRelevantExcerpt(text, undefined, 400)).toBeNull();
  });

  it('gibt null zurück, wenn die Anfrage nur aus Stoppwörtern besteht', () => {
    expect(selectRelevantExcerpt(documentWithAnswerAtEnd(), 'und was ist mit dem', 400)).toBeNull();
  });

  it('gibt null zurück, wenn der Begriff überall gleich oft steht', () => {
    // „fasse das Dokument zusammen": `dokument` trifft jeden Absatz. Eine
    // Auswahl daraus wäre schlechter als der Kopf-und-Schluss-Schnitt, weil sie
    // beliebig ist und dabei aussieht wie eine Auswahl.
    const flat = Array.from(
      { length: 20 },
      (_, i) => `## Teil ${i}\n\nDieses Dokument beschreibt das Dokument und seine Dokumentteile.`
    ).join('\n\n');
    expect(selectRelevantExcerpt(flat, 'fasse das Dokument zusammen', 400)).toBeNull();
  });

  it('wirft nie', () => {
    for (const bad of ['', '\n\n\n', '#', '|||', 'x'.repeat(50_000)]) {
      expect(() => selectRelevantExcerpt(bad, 'Löschfristen', 200)).not.toThrow();
    }
    expect(() => selectRelevantExcerpt(documentWithAnswerAtEnd(), 'Frist', 0)).not.toThrow();
    expect(() => selectRelevantExcerpt(documentWithAnswerAtEnd(), 'Frist', -5)).not.toThrow();
  });
});

describe('selectRelevantExcerpt — was es statt des Kopfes nimmt', () => {
  const text = documentWithAnswerAtEnd();
  const WINDOW = 600;

  it('behält die Passage zur Anfrage, die der Kopfschnitt verfehlt hätte', () => {
    const head = text.slice(0, WINDOW);
    expect(head).not.toContain('Löschfristen');

    const picked = selectRelevantExcerpt(text, 'Wie lang sind die Löschfristen?', WINDOW);
    expect(picked).not.toBeNull();
    expect(picked!.text).toContain('Löschfristen');
  });

  it('meldet den Offset, an dem die beste Passage im Original steht', () => {
    const picked = selectRelevantExcerpt(text, 'Löschfristen', WINDOW);
    // Genau die Zahl aus #2289: liegt sie über dem Fenster, hätte der
    // Kopfschnitt den falschen Text bewertet.
    expect(picked!.firstRelevantOffset).toBeGreaterThan(WINDOW);
    expect(text.slice(picked!.firstRelevantOffset)).toContain('Löschfristen');
  });

  it('bleibt im Budget', () => {
    for (const window of [200, 300, 600, 1200, 2400]) {
      const picked = selectRelevantExcerpt(text, 'Löschfristen Bewerbungsunterlagen', window);
      if (!picked) continue;
      expect(picked.text.length, `window=${window}`).toBeLessThanOrEqual(window);
      expect(picked.text.length, `window=${window}`).toBeGreaterThan(0);
    }
  });

  it('liefert mehrere Passagen in Dokumentreihenfolge, mit Lückenmarke', () => {
    const withTwo =
      '## Überblick\n\nDie Löschfristen im Überblick.\n\n' +
      Array.from(
        { length: 30 },
        (_, i) =>
          `## F${i}\n\nFüllabsatz über Zuständigkeiten, Zeitpläne und die Verwaltung im Haus.`
      ).join('\n\n') +
      '\n\n## Anhang\n\nWeitere Löschfristen stehen im Anhang.';
    const picked = selectRelevantExcerpt(withTwo, 'Löschfristen', 800);
    expect(picked).not.toBeNull();
    if (picked!.keptPassages > 1) {
      expect(picked!.text).toContain('Zeichen ausgelassen');
      expect(picked!.text.indexOf('Überblick')).toBeLessThan(picked!.text.indexOf('Anhang'));
    }
  });

  it('füllt das Budget nicht mit Passagen ohne Bezug auf', () => {
    // Nur ein Absatz trägt den Begriff; die anderen dürfen nicht als Beiwerk
    // mitkommen, sonst ist es wieder ein Positionsschnitt mit anderem Anfang.
    // Das Budget könnte zwei bis drei Passagen tragen; nur eine trägt den Begriff.
    const picked = selectRelevantExcerpt(text, 'Bewerbungsunterlagen', 1000);
    expect(picked).not.toBeNull();
    expect(picked!.text).toContain('Bewerbungsunterlagen');
    expect(picked!.text.length).toBeLessThan(1000);
  });

  it('liefert im Modus contiguous einen zusammenhängenden Ausschnitt des Originals', () => {
    const picked = selectRelevantExcerpt(text, 'Löschfristen', WINDOW, 'contiguous');
    expect(picked).not.toBeNull();
    // Zusammenhängend heisst: der Ausschnitt steht so im Original — keine
    // Sprungmarken, keine zusammengesetzten Stücke. Genau das braucht der
    // Cross-Encoder, der die zusammengesetzte Form schlechter bewertet hat.
    expect(picked!.text).not.toContain('Zeichen ausgelassen');
    expect(text).toContain(picked!.text);
    expect(picked!.text).toContain('Löschfristen');
    expect(picked!.text.length).toBeLessThanOrEqual(WINDOW);
  });

  it('nimmt im Modus contiguous auch Überschriften mit, die der Zerleger weglässt', () => {
    // `chunkPageForDistill` hebt Überschriften aus dem Text heraus; ein aus
    // Chunks zusammengesetzter Auszug verlöre sie. Der Schnitt aus dem Original
    // behält sie.
    const picked = selectRelevantExcerpt(text, 'Löschfristen', WINDOW, 'contiguous');
    expect(picked!.text).toMatch(/##\s/);
  });

  it('nimmt den Kopf DER getroffenen Passage, wenn nur eine passt und die zu lang ist', () => {
    const one = `Vorspann ohne Bezug.\n\n## Ziel\n\n${'Löschfristen '.repeat(200)}`;
    const picked = selectRelevantExcerpt(one, 'Löschfristen', 300);
    expect(picked).not.toBeNull();
    expect(picked!.text.length).toBeLessThanOrEqual(300);
    expect(picked!.text).toContain('Löschfristen');
  });
});
