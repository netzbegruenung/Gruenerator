import { beforeEach, describe, expect, it, vi } from 'vitest';

const aiObject = vi.fn();
vi.mock('../../ai/generate.js', () => ({ aiObject: (c: unknown) => aiObject(c) }));

import { type FetchedDoc } from './fetchTexts.js';
import { readDocuments, splitWindows } from './read.js';

const budget = { maxDocuments: 12, maxReadChars: 10_000_000, deadlineMs: 60_000 };

function doc(ref: string, text: string, textSource: FetchedDoc['textSource'] = 'dip'): FetchedDoc {
  return {
    ref,
    dipId: ref,
    kind: 'drucksache',
    dokumentnummer: ref,
    drucksachetyp: 'Antrag',
    titel: 't',
    datum: '2025-01-01',
    urheber: ['SPD'],
    pdfUrl: null,
    vorgangId: null,
    vorgangTitel: null,
    abstract: null,
    aktualisiert: null,
    beratung: null,
    text,
    textSource,
  } as FetchedDoc;
}

/** Ahmt `aiObject` nach: das Rohergebnis läuft durch `validate`. */
function respond(handler: (call: { prompt: string }) => unknown) {
  aiObject.mockImplementation(async (call: { prompt: string; validate: (i: unknown) => any }) => {
    const v = call.validate(handler(call));
    return v.ok ? { ok: true, data: v.value } : { ok: false, error: v.error };
  });
}

const bigText = (n: number) =>
  Array.from({ length: n }, (_, i) => `Absatz${i} ` + 'x'.repeat(90)).join('\n\n');

beforeEach(() => {
  aiObject.mockReset();
});

describe('splitWindows', () => {
  it('teilt an Absatzgrenzen', () => {
    const w = splitWindows('aaa\n\nbbb\n\nccc', 8);
    expect(w).toEqual(['aaa\n\nbbb', 'ccc']);
  });
});

describe('Fensterwahl', () => {
  // Sechs Absätze à 150k: bei 240k Fenstergröße passt nur einer in ein Fenster, also sechs Fenster.
  const para = (tag: string) => tag + ' ' + 'y'.repeat(150_000);
  const text = ['a0', 'a1', 'a2', 'a3 Wärmepumpe Förderung', 'a4 Wärmepumpe', 'a5']
    .map(para)
    .join('\n\n');

  it('frage: Fenster 0 plus die zwei mit den meisten Treffern', async () => {
    respond(() => ({ relevant: false, punkte: [] }));
    const [r] = await readDocuments({
      question: 'Wärmepumpe Förderung?',
      keywords: ['wärmepumpe', 'förderung'],
      auftrag: 'frage',
      docs: [doc('21/1', text)],
      budget,
      target: { provider: 'cortecs', model: 'gemma-4-31b-it' },
    });
    // 150k-Absätze: 1 je Fenster (2 passen nicht in 240k)
    expect(r!.windowsTotal).toBe(6);
    expect(r!.windowsRead).toBe(3);
    const prompts = aiObject.mock.calls.map((c) => c[0].prompt as string);
    expect(prompts.some((p) => p.includes('Teil 1/6'))).toBe(true);
    expect(prompts.some((p) => p.includes('Teil 4/6'))).toBe(true);
    expect(prompts.some((p) => p.includes('Teil 5/6'))).toBe(true);
  });

  it('zusammenfassung: Fenster 0, 1, 2', async () => {
    respond(() => ({ relevant: false, punkte: [] }));
    await readDocuments({
      question: 'Fasse zusammen',
      keywords: [],
      auftrag: 'zusammenfassung',
      docs: [doc('21/1', text)],
      budget,
      target: { provider: 'cortecs', model: 'gemma-4-31b-it' },
    });
    const prompts = aiObject.mock.calls.map((c) => c[0].prompt as string);
    expect(prompts.map((p) => /Teil (\d)\/6/.exec(p)![1]).sort()).toEqual(['1', '2', '3']);
  });
});

describe('Belegprüfung', () => {
  const src =
    'Die Bundesregierung wird aufgefordert,   die Förderung  zu erhöhen.\n\nZweiter Absatz.';
  it('erfundenes Zitat entfällt, normalisiertes bleibt (mit Quelltext)', async () => {
    respond(() => ({
      relevant: true,
      punkte: [
        { aussage: 'echt', zitat: 'aufgefordert, die Förderung zu erhöhen' },
        { aussage: 'erfunden', zitat: 'Der Mond besteht aus Käse und Bundeshaushalt' },
      ],
    }));
    const [r] = await readDocuments({
      question: 'q',
      keywords: [],
      auftrag: 'frage',
      docs: [doc('21/1', src)],
      budget,
    });
    expect(r!.relevant).toBe(true);
    expect(r!.droppedPoints).toBe(1);
    expect(r!.points).toHaveLength(1);
    expect(r!.points[0]).toMatchObject({
      method: 'normalized',
      zitat: 'aufgefordert,   die Förderung  zu erhöhen',
    });
    expect(r!.usage).toBeNull();
    expect(r!.charsRead).toBe(src.length);
  });

  it('ein Einwort-Zitat, das im Text steht, entfällt', async () => {
    respond(() => ({ relevant: true, punkte: [{ aussage: 'dünn', zitat: 'Förderung' }] }));
    const [r] = await readDocuments({
      question: 'q',
      keywords: [],
      auftrag: 'frage',
      docs: [doc('21/1', src)],
      budget,
    });
    expect(r!.points).toEqual([]);
    expect(r!.droppedPoints).toBe(1);
  });

  it('leere Aussage entfällt', async () => {
    respond(() => ({
      relevant: true,
      punkte: [{ aussage: '  ', zitat: 'aufgefordert, die Förderung zu erhöhen' }],
    }));
    const [r] = await readDocuments({
      question: 'q',
      keywords: [],
      auftrag: 'frage',
      docs: [doc('21/1', src)],
      budget,
    });
    expect(r!.points).toEqual([]);
    expect(r!.droppedPoints).toBe(1);
  });

  it('aiObject bekommt attempts: 1', async () => {
    respond(() => ({ relevant: false, punkte: [] }));
    await readDocuments({
      question: 'q',
      keywords: [],
      auftrag: 'frage',
      docs: [doc('21/1', src)],
      budget,
    });
    expect(aiObject.mock.calls[0]![0].attempts).toBe(1);
  });

  it('gescheitertes Fenster lässt das Dokument nicht ausfallen', async () => {
    aiObject.mockResolvedValue({ ok: false, error: 'boom' });
    const [r] = await readDocuments({
      question: 'q',
      keywords: [],
      auftrag: 'frage',
      docs: [doc('21/1', src)],
      budget,
    });
    expect(r!.windowsRead).toBe(1);
    expect(r!.points).toEqual([]);
    expect(r!.skipped).toBeNull();
  });
});

describe('Budget und Deadline', () => {
  it('missing wird übersprungen, ohne Aufruf', async () => {
    respond(() => ({ relevant: false, punkte: [] }));
    const [r] = await readDocuments({
      question: 'q',
      keywords: [],
      auftrag: 'frage',
      docs: [doc('21/1', '', 'missing')],
      budget,
    });
    expect(r!.skipped).toBe('missing');
    expect(aiObject).not.toHaveBeenCalled();
  });

  it('aufgebrauchtes maxReadChars -> budget', async () => {
    respond(() => ({ relevant: false, punkte: [] }));
    const rs = await readDocuments({
      question: 'q',
      keywords: [],
      auftrag: 'frage',
      docs: [doc('21/1', 'a'.repeat(100)), doc('21/2', 'b'.repeat(100))],
      budget: { ...budget, maxReadChars: 100 },
    });
    expect(rs[0]!.skipped).toBeNull();
    expect(rs[1]!.skipped).toBe('budget');
    expect(rs[1]!.windowsRead).toBe(0);
  });

  it('nach der Deadline startet nichts mehr', async () => {
    respond(() => ({ relevant: false, punkte: [] }));
    const [r] = await readDocuments({
      question: 'q',
      keywords: [],
      auftrag: 'frage',
      docs: [doc('21/1', 'abc')],
      budget: { ...budget, deadlineMs: 0 },
    });
    expect(r!.skipped).toBe('deadline');
    expect(aiObject).not.toHaveBeenCalled();
  });
});

describe('Parallelität', () => {
  it('höchstens 4 Aufrufe gleichzeitig', async () => {
    let active = 0;
    let peak = 0;
    aiObject.mockImplementation(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return { ok: true, data: { relevant: false, punkte: [] } };
    });
    const docs = Array.from({ length: 10 }, (_, i) => doc(`21/${i}`, bigText(3)));
    await readDocuments({ question: 'q', keywords: [], auftrag: 'frage', docs, budget });
    expect(aiObject).toHaveBeenCalledTimes(10);
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1);
  });
});

describe('Fenstergröße folgt dem Modell', () => {
  // Zwei Absätze à 300k: bei 240k wird jeder hart in 240k+60k geschnitten (4 Fenster), bei 800k passt alles in eins.
  const text = ['p'.repeat(300_000), 'q'.repeat(300_000)].join('\n\n');
  it('Lane-Modell (kolibri-1 seit 28.10.2026): 800k ohne target', async () => {
    respond(() => ({ relevant: false, punkte: [] }));
    const [r] = await readDocuments({
      question: 'q',
      keywords: [],
      auftrag: 'frage',
      docs: [doc('21/1', text)],
      budget,
    });
    expect(r!.windowsTotal).toBe(1);
  });
  it('target gemma-4-31b-it: 240k', async () => {
    respond(() => ({ relevant: false, punkte: [] }));
    const [r] = await readDocuments({
      question: 'q',
      keywords: [],
      auftrag: 'frage',
      docs: [doc('21/1', text)],
      budget,
      target: { provider: 'cortecs', model: 'gemma-4-31b-it' },
    });
    expect(r!.windowsTotal).toBe(4);
  });
  it('target kolibri-1: 800k', async () => {
    respond(() => ({ relevant: false, punkte: [] }));
    const [r] = await readDocuments({
      question: 'q',
      keywords: [],
      auftrag: 'frage',
      docs: [doc('21/1', text)],
      budget,
      target: { provider: 'mistral', model: 'kolibri-1' },
    });
    expect(r!.windowsTotal).toBe(1);
    expect(aiObject.mock.calls[0]![0].pinned).toEqual({ provider: 'mistral', model: 'kolibri-1' });
  });
});
