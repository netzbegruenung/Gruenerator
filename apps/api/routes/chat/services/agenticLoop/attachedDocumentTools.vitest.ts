import { describe, expect, it, vi } from 'vitest';

import {
  loadAttachedTexts,
  runAttachedDocumentMode,
  type AttachedDocDeps,
} from './attachedDocumentTools.js';
import { createSourceRegistry } from './sourceRegistry.js';

import type { DocumentSource } from '../../../../agents/langgraph/ChatGraph/types.js';

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
    const doc = qdrantOnly[id];
    // Wie `documentRetrieval.getDocumentChunks`: Filter auf user_id.
    if (!doc || doc.owner !== userId) {
      return { success: false, chunks: [], chunkCount: 0, error: 'No chunks found' };
    }
    return { success: true, chunks: [{ index: 0, text: doc.text, tokens: 1 }], chunkCount: 1 };
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
