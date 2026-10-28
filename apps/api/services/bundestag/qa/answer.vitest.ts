import { describe, expect, it, vi } from 'vitest';

const aiText = vi.hoisted(() => vi.fn());
vi.mock('../../ai/generate.js', () => ({ aiText }));

import { composeAnswer, numberPoints, stripInvalidCitations } from './answer.js';
import { type ReadResult } from './read.js';

function result(ref: string, n: number, extra: Partial<ReadResult> = {}): ReadResult {
  return {
    doc: {
      ref,
      dipId: ref,
      kind: 'drucksache',
      dokumentnummer: ref,
      drucksachetyp: 'Antrag',
      titel: `Titel ${ref}`,
      datum: '2025-01-01',
      urheber: ['Fraktion der SPD'],
      pdfUrl: null,
      vorgangId: null,
      vorgangTitel: null,
      abstract: null,
      aktualisiert: null,
      beratung: null,
      text: 'x',
      textSource: 'dip',
    } as unknown as ReadResult['doc'],
    relevant: n > 0,
    points: Array.from({ length: n }, (_, i) => ({
      aussage: `A${ref}-${i}`,
      zitat: `Z${ref}-${i}`,
      method: 'exact' as const,
    })),
    droppedPoints: 0,
    windowsRead: 1,
    windowsTotal: 1,
    skipped: null,
    usage: null,
    ...extra,
  };
}

describe('numberPoints', () => {
  it('nummeriert global in Dokumentreihenfolge', () => {
    const { citations } = numberPoints([result('21/1', 2), result('21/2', 1)]);
    expect(citations.map((c) => [c.n, c.ref])).toEqual([
      [1, '21/1'],
      [2, '21/1'],
      [3, '21/2'],
    ]);
  });

  it('kappt auf 4 je Dokument und 40 insgesamt', () => {
    const one = numberPoints([result('21/1', 9)]);
    expect(one.citations).toHaveLength(4);
    expect(one.capped).toBe(5);
    const many = numberPoints(Array.from({ length: 14 }, (_, i) => result(`21/${i + 1}`, 4)));
    expect(many.citations).toHaveLength(40);
    expect(many.citations.at(-1)?.n).toBe(40);
    expect(many.capped).toBe(16);
  });
});

describe('stripInvalidCitations', () => {
  it('entfernt Nummern außerhalb 1..n und zählt sie', () => {
    expect(stripInvalidCitations('Ja [1] und [7] sowie [0].', 3)).toEqual({
      text: 'Ja [1] und sowie.',
      invalid: 2,
    });
  });
  it('behandelt Listen und Bereiche', () => {
    const r = stripInvalidCitations('A [1, 9] B [2-4] C [8-9]', 3);
    expect(r.text).toBe('A [1] B [2, 3] C');
    expect(r.invalid).toBe(1 + 1 + 2);
  });
});

describe('composeAnswer', () => {
  it('fragt das Modell mit nummerierten Punkten und säubert die Antwort', async () => {
    aiText.mockResolvedValueOnce('Antwort [1] und [5].');
    const out = await composeAnswer({
      question: 'Frage?',
      filters: {},
      results: [result('21/1', 1), result('21/2', 0, { skipped: 'budget' })],
    });
    expect(out.answer).toBe('Antwort [1] und.');
    expect(out.invalidCitations).toBe(1);
    const call = aiText.mock.calls[0]![0];
    expect(call.lane).toBe('bundestag_answer');
    expect(call.temperature).toBe(0.2);
    expect(call.maxOutputTokens).toBe(2000);
    expect(call.prompt).toContain(
      '[1] 21/1 · Antrag · 2025-01-01 · Fraktion der SPD: A21/1-0 — „Z21/1-0“'
    );
    expect(call.prompt).toContain('21/2');
    expect(call.prompt).toContain('Lesebudget');
  });

  it('ruft das Modell bei null Punkten nicht auf', async () => {
    aiText.mockClear();
    const out = await composeAnswer({
      question: 'Frage?',
      filters: { wahlperiode: [21], datumVon: '2025-01-01' },
      results: [result('21/1', 0)],
    });
    expect(aiText).not.toHaveBeenCalled();
    expect(out.citations).toEqual([]);
    expect(out.answer).toContain('Wahlperiode 21');
    expect(out.answer).toContain('21/1');
  });
});
