import { describe, expect, it, vi } from 'vitest';

import {
  SLICE_DEFAULT_CHARS,
  SLICE_MAX_CHARS,
  SLICE_REGISTER_CHARS,
} from '../../../../services/notebook/notebookSources.js';

import {
  loadAttachedTexts,
  readAttachedSlice,
  runAttachedDocumentMode,
  type AttachedDocDeps,
} from './attachedDocumentTools.js';
import { createSourceRegistry } from './sourceRegistry.js';

import type { DocumentSource } from '../../../../agents/langgraph/ChatGraph/types.js';
import type { DocumentChunkItem } from '../../../../services/document-services/DocumentSearchService/types.js';

const USER = '11111111-1111-4111-8111-111111111111';
const DOC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DOC2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const FOREIGN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const MARKED = [
  '## Seite 1',
  'Einleitung zum Radverkehr in der Stadt.',
  '## Seite 2',
  'Der Radverkehr wird ausgebaut. Neue Radwege entstehen.',
  '## Seite 3',
  'Zum Schluss: mehr Radverkehr, weniger Lärm.',
].join('\n\n');

interface Doc {
  owner: string;
  text: string;
  chunks?: DocumentChunkItem[];
}

/** `docs`: Zeilen in `documents`. `qdrantOnly`: Chunks ohne Zeile, je Eigentümer*in. */
function depsFor(
  docs: Record<string, Doc>,
  qdrantOnly: Record<string, Doc> = {}
): AttachedDocDeps & {
  query: ReturnType<typeof vi.fn>;
  getDocumentChunks: ReturnType<typeof vi.fn>;
} {
  const query = vi.fn(async (sql: string, params: unknown[]) => {
    if (sql.includes('markdown_content')) {
      const doc = docs[params[0] as string];
      return doc ? [{ markdown_content: doc.text }] : [];
    }
    const [ids] = params as [string[]];
    return ids.filter((id) => docs[id]).map((id) => ({ id, user_id: docs[id]!.owner }));
  });
  const getDocumentChunks = vi.fn(async (userId: string, id: string) => {
    const only = qdrantOnly[id];
    // Wie `documentRetrieval.getDocumentChunks`: Filter auf user_id.
    const chunks =
      only && only.owner === userId
        ? [{ index: 0, text: only.text, tokens: 1 }]
        : docs[id]?.owner === userId
          ? (docs[id]?.chunks ?? [])
          : [];
    return chunks.length
      ? { success: true, chunks, chunkCount: chunks.length }
      : { success: false, chunks: [], chunkCount: 0, error: 'No chunks found' };
  });
  return {
    query,
    getDocumentChunks,
    db: { query } as unknown as AttachedDocDeps['db'],
    documentService: { getDocumentChunks } as unknown as AttachedDocDeps['documentService'],
  };
}

const src = (id: string, label: string): DocumentSource => ({ kind: 'document_chat', id, label });

function ctx(sources: DocumentSource[], deps: AttachedDocDeps) {
  const sourceRegistry = createSourceRegistry();
  return { sourceRegistry, run: { userId: USER, sources, sourceRegistry, deps } };
}

describe('dokumente_lesen seite', () => {
  it('liest eine Seite nach den ## Seite N-Marken und trägt Seite + Zeichenbereich ein', async () => {
    const deps = depsFor({ [DOC]: { owner: USER, text: MARKED } });
    const { sourceRegistry, run } = ctx([src(DOC, 'Plan.pdf')], deps);

    const out = await runAttachedDocumentMode({ seite: 2 }, run);

    expect(out.error).toBeUndefined();
    expect(out.pageRange).toEqual({ from: 2, to: 2 });
    const [r] = sourceRegistry.getResults();
    expect(r?.content).toContain('Der Radverkehr wird ausgebaut.');
    expect(r?.content).not.toContain('Einleitung');
    expect(r?.pageNumber).toBe(2);
    expect(r?.pageTo).toBe(2);
    expect(MARKED.slice(r!.charStart!, r!.charEnd!)).toBe(
      'Der Radverkehr wird ausgebaut. Neue Radwege entstehen.'
    );
    expect(sourceRegistry.renderAll()).toContain('(S. 2)');
  });

  it('meldet eine Seite, die es nicht gibt, mit dem Seitenbereich', async () => {
    const deps = depsFor({ [DOC]: { owner: USER, text: MARKED } });
    const out = await runAttachedDocumentMode({ seite: 9 }, ctx([src(DOC, 'Plan.pdf')], deps).run);
    expect(out.error).toBe('Seite 9 gibt es nicht (Seiten 1–3).');
  });

  it('sagt ohne Marken und ohne Chunk-Seiten, dass es keine Seitenzahlen gibt', async () => {
    const deps = depsFor({ [DOC]: { owner: USER, text: 'Fliesstext ohne Seiten.' } });
    const out = await runAttachedDocumentMode(
      { seite: 1 },
      ctx([src(DOC, 'Notiz.docx')], deps).run
    );
    expect(out.error).toMatch(/keine Seitenzahlen/);
    expect(out.error).not.toContain('chunks');
  });

  it('verlangt dateiname, wenn mehrere Dateien angehängt sind', async () => {
    const deps = depsFor({
      [DOC]: { owner: USER, text: MARKED },
      [DOC2]: { owner: USER, text: MARKED },
    });
    const out = await runAttachedDocumentMode(
      { seite: 1 },
      ctx([src(DOC, 'Plan.pdf'), src(DOC2, 'Antrag.pdf')], deps).run
    );
    expect(out.error).toMatch(/dateiname/);
  });
});

describe('dokumente_lesen wortsuche', () => {
  it('zählt über alle Seiten vollständig, mit Seite je Fundstelle, und notiert die Zahl', async () => {
    const deps = depsFor({ [DOC]: { owner: USER, text: MARKED } });
    const { sourceRegistry, run } = ctx([src(DOC, 'Plan.pdf')], deps);

    const out = (await runAttachedDocumentMode({ wortsuche: { phrase: 'radverkehr' } }, run)) as {
      totalHits: number;
      exhaustive: boolean;
      perSource: Array<{ count: number; fundstellen: Array<{ seite: number | null }> }>;
    };

    expect(out.totalHits).toBe(3);
    expect(out.exhaustive).toBe(true);
    expect(out.perSource[0]?.fundstellen.map((f) => f.seite)).toEqual([1, 2, 3]);
    const [r] = sourceRegistry.getResults();
    expect(r?.pageNumber).toBe(1);
    // Der Schreiber im split-Modus sieht nur Quellen und Notizen.
    expect(sourceRegistry.renderAll()).toContain('totalHits: 3');
  });

  it('beachtet grossKlein', async () => {
    const deps = depsFor({ [DOC]: { owner: USER, text: MARKED } });
    const out = await runAttachedDocumentMode(
      { wortsuche: { phrase: 'radverkehr', grossKlein: true } },
      ctx([src(DOC, 'Plan.pdf')], deps).run
    );
    expect(out.totalHits).toBe(0);
  });

  it('zählt ein fremdes Dokument nicht mit und sagt, dass die Zahl unvollständig ist', async () => {
    const deps = depsFor({
      [DOC]: { owner: USER, text: MARKED },
      [FOREIGN]: { owner: '99999999-9999-4999-8999-999999999999', text: 'Radverkehr Radverkehr' },
    });
    const out = await runAttachedDocumentMode(
      { wortsuche: { phrase: 'Radverkehr' } },
      ctx([src(DOC, 'Plan.pdf'), src(FOREIGN, 'Fremd.pdf')], deps).run
    );
    expect(out.totalHits).toBe(3);
    expect(out.exhaustive).toBe(false);
    expect(out.note).toMatch(/Untergrenze/);
    // Der Text des fremden Dokuments wird gar nicht erst abgefragt.
    const textReads = deps.query.mock.calls.filter(([sql]) =>
      String(sql).includes('markdown_content')
    );
    expect(textReads.map(([, p]) => (p as string[])[0])).toEqual([DOC]);
  });
});

describe('dokumente_lesen zitat', () => {
  const deps = () => depsFor({ [DOC]: { owner: USER, text: MARKED } });

  it('findet ein wörtliches Zitat mit Seite', async () => {
    const { sourceRegistry, run } = ctx([src(DOC, 'Plan.pdf')], deps());
    const out = await runAttachedDocumentMode({ zitat: 'Neue Radwege entstehen.' }, run);
    expect(out.befund).toBe('gefunden');
    expect(out.method).toBe('exact');
    expect(out.seite).toBe(2);
    expect(sourceRegistry.getResults()[0]?.pageNumber).toBe(2);
  });

  it('findet es auch mit anderem Leerraum', async () => {
    const out = await runAttachedDocumentMode(
      { zitat: 'Neue   Radwege\nentstehen.' },
      ctx([src(DOC, 'Plan.pdf')], deps()).run
    );
    expect(out.befund).toBe('gefunden');
    expect(out.method).toBe('normalized');
    expect(out.seite).toBe(2);
  });

  it('meldet ein fehlendes Zitat als nicht gefunden und notiert es', async () => {
    const { sourceRegistry, run } = ctx([src(DOC, 'Plan.pdf')], deps());
    const out = await runAttachedDocumentMode({ zitat: 'Die Autobahn wird verbreitert.' }, run);
    expect(out.befund).toBe('nicht gefunden');
    expect(out.exhaustive).toBe(true);
    expect(sourceRegistry.renderAll()).toContain('steht so in keinem');
  });
});

describe('loadAttachedTexts', () => {
  it('liest ein fremdes Dokument nicht', async () => {
    const deps = depsFor({ [FOREIGN]: { owner: 'someone-else', text: 'Geheim.' } });
    const out = await loadAttachedTexts(
      { userId: USER, sources: [src(FOREIGN, 'Fremd.pdf')] },
      deps
    );
    expect(out).toEqual({ error: 'Das angehängte Dokument ist nicht lesbar.' });
    expect(deps.query.mock.calls.some(([sql]) => String(sql).includes('markdown_content'))).toBe(
      false
    );
  });

  it('liest einen Anhang ohne documents-Zeile nur über die user_id-gefilterten Chunks', async () => {
    const deps = depsFor({}, { [DOC]: { owner: USER, text: 'Radverkehr im Chunk.' } });
    const out = await loadAttachedTexts({ userId: USER, sources: [src(DOC, 'Alt.pdf')] }, deps);
    expect('sources' in out && out.sources[0]?.text).toBe('Radverkehr im Chunk.');
    expect(deps.getDocumentChunks).toHaveBeenCalledWith(USER, DOC);

    const foreign = depsFor({}, { [FOREIGN]: { owner: 'someone-else', text: 'Geheim.' } });
    const denied = await loadAttachedTexts(
      { userId: USER, sources: [src(FOREIGN, 'Fremd.pdf')] },
      foreign
    );
    expect(denied).toEqual({ error: 'Das angehängte Dokument ist nicht lesbar.' });
  });

  it('liest keine ID, die keine UUID ist', async () => {
    const deps = depsFor({});
    const out = await loadAttachedTexts({ userId: USER, sources: [src('doc-1', 'X.pdf')] }, deps);
    expect('error' in out).toBe(true);
    expect(deps.query).not.toHaveBeenCalled();
    expect(deps.getDocumentChunks).not.toHaveBeenCalled();
  });

  it('liest ohne userId nichts', async () => {
    const deps = depsFor({ [DOC]: { owner: USER, text: MARKED } });
    const out = await loadAttachedTexts({ userId: null, sources: [src(DOC, 'Plan.pdf')] }, deps);
    expect('error' in out).toBe(true);
    expect(deps.query).not.toHaveBeenCalled();
  });
});

describe('dokumente_lesen seite — weitere Formen', () => {
  it('nimmt ohne Marken die Seitenzahlen der Chunks', async () => {
    const text = 'Erste Seite Text.\n\nZweite Seite Text.';
    const chunks: DocumentChunkItem[] = [
      { index: 0, text: 'Erste Seite Text.', tokens: 3, pageNumber: 1, charStart: 0, charEnd: 17 },
      {
        index: 1,
        text: 'Zweite Seite Text.',
        tokens: 3,
        pageNumber: 2,
        charStart: 19,
        charEnd: 37,
      },
    ];
    const deps = depsFor({ [DOC]: { owner: USER, text, chunks } });
    const { sourceRegistry, run } = ctx([src(DOC, 'Plan.pdf')], deps);

    const out = await runAttachedDocumentMode({ seite: 2 }, run);

    expect(out.error).toBeUndefined();
    const [r] = sourceRegistry.getResults();
    expect(r?.content).toContain('Zweite Seite Text.');
    expect(r?.content).not.toContain('Erste');
    expect(r?.pageNumber).toBe(2);
  });

  it('sagt bei einer langen Seite, wo sie weitergeht — und abschnitt liest genau dort weiter', async () => {
    const long = `Anfang der langen Seite. ${'Wort '.repeat(4_000)}Ende der langen Seite.`;
    const text = `## Seite 1\n\nKurz.\n\n## Seite 2\n\n${long}\n\n## Seite 3\n\nSchluss.`;
    const deps = depsFor({ [DOC]: { owner: USER, text } });
    const { sourceRegistry, run } = ctx([src(DOC, 'Plan.pdf')], deps);

    await runAttachedDocumentMode({ seite: 2 }, run);
    const [page] = sourceRegistry.getResults();
    const next = /abschnitt\.von=(\d+)/.exec(page?.content ?? '');
    expect(next).not.toBeNull();
    const von = Number(next![1]);
    expect(von).toBe(page!.charEnd);

    const [cont] = await readAttachedSlice(
      { userId: USER, sources: [src(DOC, 'Plan.pdf')], from: von },
      deps
    );
    const body = (cont?.content ?? '').replace(/^\[[^\]]*]\n\n/, '');
    // Die Fortsetzung schliesst lückenlos an die gelesene Seite an.
    expect(body).toBe(text.slice(von, von + body.length));
    expect(body).toContain('Ende der langen Seite.');
  });
});

describe('abschnitt über denselben Loader', () => {
  it('liest an den Offsets, die wortsuche und seite nennen', async () => {
    const deps = depsFor({ [DOC]: { owner: USER, text: MARKED } });
    const { sourceRegistry, run } = ctx([src(DOC, 'Plan.pdf')], deps);

    await runAttachedDocumentMode({ wortsuche: { phrase: 'Radwege' } }, run);
    const hit = sourceRegistry.getResults()[0]!;
    const [fromGrep] = await readAttachedSlice(
      { userId: USER, sources: [src(DOC, 'Plan.pdf')], from: hit.charStart!, chars: 7 },
      deps
    );
    expect(fromGrep?.content).toMatch(/\n\nRadwege$/);

    const pageReg = ctx([src(DOC, 'Plan.pdf')], deps);
    await runAttachedDocumentMode({ seite: 3 }, pageReg.run);
    const page = pageReg.sourceRegistry.getResults()[0]!;
    const [fromPage] = await readAttachedSlice(
      {
        userId: USER,
        sources: [src(DOC, 'Plan.pdf')],
        from: page.charStart!,
        chars: page.charEnd! - page.charStart!,
      },
      deps
    );
    expect(fromPage?.content).toContain('\n\nZum Schluss: mehr Radverkehr, weniger Lärm.');
  });

  it('trägt die Seiten einer Scheibe über mehrere Seiten ein', async () => {
    const deps = depsFor({ [DOC]: { owner: USER, text: MARKED } });
    const [r] = await readAttachedSlice(
      { userId: USER, sources: [src(DOC, 'Plan.pdf')], from: 0 },
      deps
    );
    expect(r?.pageNumber).toBe(1);
    expect(r?.pageTo).toBe(3);
  });

  it('liefert die erste Scheibe samt vorangestelltem Wegweiser zur nächsten', async () => {
    const deps = depsFor({ [DOC]: { owner: USER, text: 'x'.repeat(25_000) } });
    const [r] = await readAttachedSlice(
      { userId: USER, sources: [src(DOC, 'Beschlusspapier.pdf')], from: 0 },
      deps
    );
    expect(r?.title).toBe('Beschlusspapier.pdf');
    // Vorn, weil gekappt immer der Schwanz wird.
    expect(r?.content.startsWith('[Zeichen 0–')).toBe(true);
    expect(r?.content).toContain(`weiter mit abschnitt.von=${SLICE_DEFAULT_CHARS}`);
    expect(r?.content).toContain('von 25000');
  });

  /**
   * Die Scheibe muss in das passen, was `sourceRegistry.register` durchlässt.
   * Lag sie darüber (40.000 gegen 12.000), bekam das Modell 12k Text, las im
   * Wegweiser aber „Zeichen 0–40000" und übersprang beim Weiterlesen still 28k.
   */
  it('deckelt eine geratene Zeichenzahl unter dem Registrierungs-Deckel', async () => {
    const deps = depsFor({ [DOC]: { owner: USER, text: 'x'.repeat(200_000) } });
    const [r] = await readAttachedSlice(
      { userId: USER, sources: [src(DOC, 'Plan.pdf')], from: 0, chars: 999_999 },
      deps
    );
    expect(SLICE_MAX_CHARS).toBeLessThan(SLICE_REGISTER_CHARS);
    expect((r?.content ?? '').length).toBeLessThanOrEqual(SLICE_REGISTER_CHARS);
    expect((r?.content ?? '').replace(/^\[Zeichen[^\]]*]\n\n/, '')).toHaveLength(SLICE_MAX_CHARS);
  });

  it('markiert das Ende, statt einen Wegweiser ins Leere zu setzen', async () => {
    const deps = depsFor({ [DOC]: { owner: USER, text: 'x'.repeat(1_000) } });
    const [r] = await readAttachedSlice(
      { userId: USER, sources: [src(DOC, 'Plan.pdf')], from: 500 },
      deps
    );
    expect(r?.content).toContain('Ende des Dokuments');
    expect(r?.content).not.toContain('weiter mit');
  });

  it('überspringt Dokumente ohne Text, hinter dem Ende und fremde', async () => {
    const deps = depsFor({
      [DOC]: { owner: USER, text: '' },
      [DOC2]: { owner: USER, text: 'kurz' },
      [FOREIGN]: { owner: 'someone-else', text: 'x'.repeat(20_000) },
    });
    const out = await readAttachedSlice(
      {
        userId: USER,
        sources: [src(DOC, 'A.pdf'), src(DOC2, 'B.pdf'), src(FOREIGN, 'C.pdf')],
        from: 9_000,
      },
      deps
    );
    expect(out).toEqual([]);
  });
});

describe('dokumente_lesen zitat — weitere Befunde', () => {
  it('meldet ein fast wörtliches Zitat als ungefähr, mit dem echten Wortlaut', async () => {
    const text =
      '## Seite 1\n\nWir wollen bis zum Jahr 2030 alle Kohlekraftwerke im Land abschalten.';
    const deps = depsFor({ [DOC]: { owner: USER, text } });
    const out = await runAttachedDocumentMode(
      { zitat: 'Wir wollen bis zum Jahr 2035 alle Kohlekraftwerke im Land abschalten' },
      ctx([src(DOC, 'Plan.pdf')], deps).run
    );
    expect(out.befund).toBe('ungefähr');
    expect(out.method).toBe('fuzzy');
    expect(out.matched).toContain('2030');
    expect(out.seite).toBe(1);
  });

  it('nennt die Dateien, wenn das Zitat in mehreren steht', async () => {
    const deps = depsFor({
      [DOC]: { owner: USER, text: MARKED },
      [DOC2]: { owner: USER, text: '## Seite 4\n\nNeue Radwege entstehen.' },
    });
    const { sourceRegistry, run } = ctx([src(DOC, 'Plan.pdf'), src(DOC2, 'Antrag.pdf')], deps);
    const out = (await runAttachedDocumentMode({ zitat: 'Neue Radwege entstehen.' }, run)) as {
      candidates: Array<{ datei: string; seite: number | null }>;
      note: string;
    };
    expect(out.candidates).toEqual([
      expect.objectContaining({ datei: 'Plan.pdf', seite: 2 }),
      expect.objectContaining({ datei: 'Antrag.pdf', seite: 4 }),
    ]);
    expect(out.note).toMatch(/mehreren Dateien/);
    expect(sourceRegistry.getResults()).toHaveLength(2);
  });
});
