import { describe, expect, it, vi } from 'vitest';

import { getQdrantInstance } from '../../../database/services/QdrantService/index.js';

import { Deadline } from '../../../utils/deadline.js';

import { findNrw } from './find.js';
import { getNrwNotebook, type NrwFilter, type NrwNotebook, type NrwPayload } from './notebook.js';
import { fetchNrwTexts, resolveNrwRefs } from './read.js';

// Die echten Funktionen von notebook.ts, ohne Qdrant- und Mistral-Anbindung.
vi.mock('../../../database/services/QdrantService/index.js', () => ({
  getQdrantInstance: vi.fn(),
}));
vi.mock('../../mistral/index.js', () => ({ mistralEmbeddingService: {} }));

const doc = (nr: string, extra: NrwPayload = {}): NrwPayload => ({
  document_id: `ltnrw-${nr.replace('/', '-')}`,
  document_number: nr,
  doc_type: 'Antrag',
  title: `Titel ${nr}`,
  published_at: '2026-10-01',
  party: ['GRÜNE'],
  source_url: `https://www.landtag.nrw.de/portal/WWW/dokumentenarchiv/Dokument/MMD${nr.replace('/', '-')}.pdf`,
  keywords: ['Klimaschutz'],
  ...extra,
});

function fake(rows: NrwPayload[] = [doc('18/100'), doc('18/101')], count = 40) {
  const nb = {
    latest: vi.fn<NrwNotebook['latest']>(async () => rows),
    nearest: vi.fn<NrwNotebook['nearest']>(async () => rows),
    count: vi.fn<NrwNotebook['count']>(async () => count),
    text: vi.fn<NrwNotebook['text']>(async () => 'Volltext'),
  };
  return nb;
}

const mustOf = (f: NrwFilter) => (f.must ?? []) as Array<Record<string, unknown>>;

describe('findNrw', () => {
  it('schneidet das Notebook nicht vor der Frist ab: es bekommt die Restzeit (#5565)', async () => {
    vi.useFakeTimers();
    const deadline = new Deadline(40_000);
    try {
      const nb = fake();
      nb.nearest.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([doc('18/100')]), 30_000))
      );
      const pending = findNrw({ query: 'Klima', filters: {}, deadline }, nb);
      await vi.advanceTimersByTimeAsync(30_001);
      const r = await pending;
      expect(r.candidates.map((c) => c.ref)).toEqual(['NW 18/100']);
    } finally {
      deadline.dispose();
      vi.useRealTimers();
    }
  });

  it('gibt an der Frist auf, statt die Werkzeugfrist zu reißen', async () => {
    vi.useFakeTimers();
    const deadline = new Deadline(40_000);
    try {
      const nb = fake();
      nb.nearest.mockImplementation(() => new Promise(() => {}));
      const pending = findNrw({ query: 'Klima', filters: {}, deadline }, nb);
      const erwartet = expect(pending).rejects.toThrow(/landtag-nrw/);
      await vi.advanceTimersByTimeAsync(40_001);
      await erwartet;
    } finally {
      deadline.dispose();
      vi.useRealTimers();
    }
  });

  it('listet ohne query die neuesten Drucksachen je Dokument (Chunk 0) und zählt sie', async () => {
    const nb = fake();
    const r = await findNrw({ query: '', filters: { typ: ['Gesetzentwurf'] } }, nb);
    expect(nb.nearest).not.toHaveBeenCalled();
    const [filter, limit] = nb.latest.mock.calls[0]!;
    expect(limit).toBe(25);
    expect(mustOf(filter)).toEqual(
      expect.arrayContaining([
        { key: 'content_type', match: { value: 'drucksache' } },
        { key: 'doc_type', match: { any: ['Gesetzentwurf'] } },
        { key: 'chunk_index', match: { value: 0 } },
      ])
    );
    expect(r.candidates.map((c) => c.ref)).toEqual(['NW 18/100', 'NW 18/101']);
    expect(r.candidates[0]).toMatchObject({
      dokumentnummer: '18/100',
      drucksachetyp: 'Antrag',
      urheber: ['GRÜNE'],
      abstract: 'Klimaschutz',
      datum: '2026-10-01',
    });
    expect(r.gesamt).toBe(40);
    expect(r.notes).toEqual([expect.stringContaining('neuesten 2 von 40')]);
  });

  it('rankt mit query inhaltlich, entdoppelt Chunks desselben Dokuments und sagt die Sortierung', async () => {
    const nb = fake([doc('18/7'), doc('18/7'), doc('18/3')]);
    const r = await findNrw({ query: 'Windkraft', filters: {} }, nb);
    expect(nb.nearest).toHaveBeenCalledWith('Windkraft', expect.anything(), 120);
    expect(r.candidates.map((c) => c.ref)).toEqual(['NW 18/7', 'NW 18/3']);
    expect(r.notes).toEqual([expect.stringMatching(/Nähe zu „Windkraft“.*etwa 40/)]);
    // Die 40 zählen nur die Filter, nicht das Thema, und 2 ist die Listenlänge: keine Gesamtzahl (#5577).
    expect(r.gesamt).toBeNull();
  });

  it('sucht Volltext über alle Chunks und zählt dann keine Dokumente', async () => {
    const nb = fake();
    const r = await findNrw({ query: '', filters: { volltext: 'Tagebau' } }, nb);
    const [filter, limit] = nb.latest.mock.calls[0]!;
    expect(limit).toBe(200);
    expect(mustOf(filter)).toContainEqual({ key: 'chunk_text', match: { text: 'Tagebau' } });
    expect(mustOf(filter)).not.toContainEqual({ key: 'chunk_index', match: { value: 0 } });
    expect(nb.count).not.toHaveBeenCalled();
    expect(r.gesamt).toBe(2);
  });

  it('sucht den Titel im Kopf von Chunk 0', async () => {
    const nb = fake();
    await findNrw({ query: '', filters: { titel: 'Schulbau' } }, nb);
    const must = mustOf(nb.latest.mock.calls[0]![0]);
    expect(must).toContainEqual({ key: 'chunk_text', match: { text: 'Schulbau' } });
    expect(must).toContainEqual({ key: 'chunk_index', match: { value: 0 } });
  });

  it('lässt Antworten bei Fraktion + Anfrage ungefiltert durch und sagt es', async () => {
    const nb = fake();
    const r = await findNrw({ query: '', filters: { typ: ['Anfrage'], fraktion: ['gruene'] } }, nb);
    const must = mustOf(nb.latest.mock.calls[0]![0]);
    expect(must).toContainEqual({ key: 'doc_type', match: { any: ['Große Anfrage', 'Antwort'] } });
    expect(must).toContainEqual({
      should: [
        { key: 'party', match: { any: ['GRÜNE'] } },
        { key: 'doc_type', match: { value: 'Antwort' } },
      ],
    });
    expect(r.notes.join(' ')).toMatch(/nur zusammen mit der Antwort/);
    expect(r.notes.join(' ')).toMatch(/stehen ungefiltert/);
  });

  it('filtert die Fraktion ohne Antworten direkt und nennt die Lücke', async () => {
    const nb = fake();
    const r = await findNrw({ query: '', filters: { fraktion: ['spd'] } }, nb);
    expect(mustOf(nb.latest.mock.calls[0]![0])).toContainEqual({
      key: 'party',
      match: { any: ['SPD'] },
    });
    expect(r.notes.join(' ')).toMatch(/fehlen bei einem Fraktionsfilter/);
  });

  it('grenzt den Zeitraum über published_at ein', async () => {
    const nb = fake();
    await findNrw({ query: '', filters: { datumVon: '2026-01-01', datumBis: '2026-06-30' } }, nb);
    expect(mustOf(nb.latest.mock.calls[0]![0])).toContainEqual({
      key: 'published_at',
      range: { gte: '2026-01-01', lte: '2026-06-30' },
    });
  });

  it('antwortet ohne Abfrage, wenn Wahlperiode, Art oder Fraktion hier nichts finden können', async () => {
    const nb = fake();
    const wp = await findNrw({ query: '', filters: { wahlperiode: 17 } }, nb);
    expect(wp.ausgeschlossen).toMatch(/nur die 18\. Wahlperiode/);
    const protokoll = await findNrw({ query: '', filters: { typ: ['Plenarprotokoll'] } }, nb);
    expect(protokoll.ausgeschlossen).toMatch(/Plenarprotokoll/);
    const linke = await findNrw({ query: '', filters: { fraktion: ['linke'] } }, nb);
    expect(linke.ausgeschlossen).toMatch(/nicht vertreten/);
    expect(nb.latest).not.toHaveBeenCalled();
    expect(nb.nearest).not.toHaveBeenCalled();
  });
});

describe('resolveNrwRefs / fetchNrwTexts', () => {
  it('löst Refs über document_number auf, in der Reihenfolge der Eingabe; Unbekanntes fällt weg', async () => {
    const nb = fake([doc('18/101'), doc('18/100')]);
    const found = await resolveNrwRefs(['NW 18/100', 'NW 18/999', 'BE 19/1', 'NW 18/101'], nb);
    expect(found.map((c) => c.ref)).toEqual(['NW 18/100', 'NW 18/101']);
    expect(mustOf(nb.latest.mock.calls[0]![0])).toContainEqual({
      key: 'document_number',
      match: { any: ['18/100', '18/999', '18/101'] },
    });
  });

  it('fragt bei fremden Refs gar nicht erst', async () => {
    const nb = fake();
    expect(await resolveNrwRefs(['BE 19/1'], nb)).toEqual([]);
    expect(nb.latest).not.toHaveBeenCalled();
  });

  it('liest den Text aus dem Notebook; ein Fehler kostet nur dieses Dokument', async () => {
    const nb = fake();
    nb.text.mockResolvedValueOnce('Text A').mockRejectedValueOnce(new Error('weg'));
    const cands = await resolveNrwRefs(['NW 18/100', 'NW 18/101'], nb);
    const docs = await fetchNrwTexts(cands, nb);
    expect(nb.text).toHaveBeenCalledWith('ltnrw-18-100');
    expect(docs.map((d) => [d.ref, d.text, d.textSource])).toEqual([
      ['NW 18/100', 'Text A', 'pdf'],
      ['NW 18/101', '', 'missing'],
    ]);
  });
});

describe('getNrwNotebook', () => {
  it('holt den Client je Aufruf über init(), damit ein verworfener Client neu verbunden wird', async () => {
    const init = vi.fn(async () => undefined);
    const count = vi.fn(async () => ({ count: 7 }));
    vi.mocked(getQdrantInstance).mockReturnValue({
      init,
      readClient: () => ({ count }),
    } as never);
    const nb = getNrwNotebook();
    expect(await nb.count({ must: [] })).toBe(7);
    expect(await nb.count({ must: [] })).toBe(7);
    expect(init).toHaveBeenCalledTimes(2);
  });
});
