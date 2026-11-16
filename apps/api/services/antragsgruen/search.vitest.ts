import { describe, expect, it } from 'vitest';

import { ANTRAGSGRUEN_INSTANCES } from '../../config/antragsgruenInstances.js';

import { matchConsultations, matchValues, sameKuerzel } from './resolve.js';
import { countAntragsgruen, findAntragsgruen, readAntragsgruen, type AgDeps } from './search.js';

import type { AntragsgruenLive, LiveEntry } from './live.js';
import type { AgCondition, AgFilter, AgPayload, AntragsgruenIndex } from './store.js';
import type { ConsultationRef } from '../scrapers/implementations/ParteitageScraper/antragsgruenClient.js';

const nrw = ANTRAGSGRUEN_INSTANCES[0];

const ref = (url_path: string, title: string, title_short: string): ConsultationRef => ({
  url_path,
  title,
  title_short,
  date_published: '2026-08-20T10:00:00+02:00',
  url_json: `https://${nrw.host}/rest/${url_path}`,
  url_html: `https://${nrw.host}/${url_path}`,
});

const CONSULTATIONS = [
  ref('ldk26', 'Landesdelegiertenkonferenz 20./21. Juni 2026 in Troisdorf', 'LDK Troisdorf'),
  ref('ldk26-02', 'Landesdelegiertenkonferenz 13.-15. November Essen', 'LDK Essen'),
];

const doc = (over: AgPayload): AgPayload => ({
  source_id: nrw.sourceId,
  chunk_index: 0,
  parteitag: 'LDK Essen (2026)',
  parteitag_id: 'nrw/ldk26-02',
  ...over,
});

const DOCS: AgPayload[] = [
  doc({
    document_id: 'ag-nrw-m1',
    title: 'Antrag WP-06: Ein Land der Vielfalt',
    content_type: 'antrag',
    kuerzel: 'WP-06',
    status: 'Eingereicht',
    antragsteller: ['Landesvorstand'],
    full_text: 'x'.repeat(20_000),
  }),
  doc({
    document_id: 'ag-nrw-a10',
    title: 'Änderungsantrag WP-06-001 zu Antrag WP-06',
    content_type: 'aenderungsantrag',
    kuerzel: 'WP-06-001',
    antrag_kuerzel: 'WP-06',
    antrag_titel: 'Ein Land der Vielfalt',
    status: 'Eingereicht',
    votum: 'Übernahme',
    antragsteller: ['KV Köln', 'Anna Beispiel'],
    full_text: 'Kurz [eingefügt: mehr Vielfalt]',
  }),
  doc({
    document_id: 'ag-nrw-a11',
    title: 'Änderungsantrag WP-06-002 zu Antrag WP-06',
    content_type: 'aenderungsantrag',
    kuerzel: 'WP-06-002',
    antrag_kuerzel: 'WP-06',
    status: 'Eingereicht',
    votum: 'Übernahme in modifizierter Fassung',
    antragsteller: ['KV Bonn'],
    full_text: 'Kurz',
  }),
];

/** Wertet die Filterformen aus, die `search.ts` baut — nicht mehr. */
function matches(p: AgPayload, filter: AgFilter): boolean {
  const conds = (filter.must as AgCondition[] | undefined) ?? [];
  return conds.every((c) => condition(p, c));
}

function condition(p: AgPayload, c: AgCondition): boolean {
  const any = c as {
    should?: AgCondition[];
    key?: string;
    match?: { value?: unknown; any?: unknown[] };
  };
  if (any.should) return any.should.some((s) => condition(p, s));
  const v = p[any.key!];
  const values = Array.isArray(v) ? v : [v];
  if (any.match?.any) return values.some((x) => any.match!.any!.includes(x));
  return values.includes(any.match?.value);
}

function fakeIndex(docs: AgPayload[]): AntragsgruenIndex & { queries: string[] } {
  const queries: string[] = [];
  const heads = (f: AgFilter) => docs.filter((d) => d.chunk_index === 0 && matches(d, f));
  return {
    queries,
    async nearest(query, filter, limit) {
      queries.push(query);
      return docs
        .filter((d) => matches(d, filter))
        .map((d) => ({ ...d, chunk_text: `Text zu ${String(d.title)}` }))
        .slice(0, limit);
    },
    async latest(filter, limit) {
      return heads(filter).slice(0, limit);
    },
    async facet(key, filter, limit) {
      const counts = new Map<string, number>();
      for (const d of heads(filter)) {
        const v = d[key];
        for (const x of Array.isArray(v) ? v : v == null ? [] : [v]) {
          counts.set(String(x), (counts.get(String(x)) ?? 0) + 1);
        }
      }
      return [...counts]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([value, count]) => ({ value, count }));
    },
    async count(filter) {
      return heads(filter).length;
    },
    async heads(ids) {
      return docs.filter((d) => ids.includes(String(d.document_id)));
    },
    async documentIds(filter) {
      return heads(filter).map((d) => String(d.document_id));
    },
  };
}

function fakeLive(entries: LiveEntry[] | 'down'): AntragsgruenLive {
  return {
    consultations: async () => {
      if (entries === 'down') throw new Error('down');
      return CONSULTATIONS;
    },
    entries: async () => {
      if (entries === 'down') throw new Error('down');
      return entries;
    },
  };
}

const LIVE: LiveEntry[] = [
  { documentId: 'ag-nrw-m1', status: 'Beschluss', kuerzel: 'WP-06', amendment: false },
  { documentId: 'ag-nrw-a10', status: 'Übernommen', kuerzel: 'WP-06-001', amendment: true },
  { documentId: 'ag-nrw-a11', status: 'Eingereicht', kuerzel: 'WP-06-002', amendment: true },
];

const deps = (live: LiveEntry[] | 'down' = LIVE): AgDeps => ({
  instance: nrw,
  index: fakeIndex(DOCS),
  live: fakeLive(live),
});

describe('resolve', () => {
  it('liest „Köln" als den gespeicherten Antragsteller „KV Köln"', () => {
    expect(matchValues('Köln', ['KV Köln', 'KV Bonn', 'Landesvorstand'])).toEqual(['KV Köln']);
    expect(matchValues('Kreisverband Köln', ['KV Köln'])).toEqual(['KV Köln']);
  });

  it('vergleicht Kürzel ohne Trenner und Grossschreibung', () => {
    expect(sameKuerzel('wp 06', 'WP-06')).toBe(true);
    expect(sameKuerzel('WP6', 'WP-06')).toBe(false);
  });

  it('findet Parteitage über Kurztitel, Ort oder Kennung', () => {
    expect(matchConsultations('LDK Essen', CONSULTATIONS).map((r) => r.url_path)).toEqual([
      'ldk26-02',
    ]);
    expect(matchConsultations('ldk26', CONSULTATIONS).map((r) => r.url_path)).toEqual(['ldk26']);
    expect(matchConsultations('Troisdorf', CONSULTATIONS).map((r) => r.url_path)).toEqual([
      'ldk26',
    ]);
  });
});

describe('findAntragsgruen', () => {
  it('liefert Antrag und Änderungsanträge zu einem Kürzel, mit exakter Gesamtzahl', async () => {
    const r = await findAntragsgruen(deps(), undefined, { antrag: 'wp-06' });
    expect(r.gesamt).toBe(3);
    expect(r.documents.map((d) => d.ref).sort()).toEqual(['ag-nrw-a10', 'ag-nrw-a11', 'ag-nrw-m1']);
  });

  it('löst das Kürzel vor dem Typfilter auf: nur die Änderungsanträge zu WP-06', async () => {
    const r = await findAntragsgruen(deps(), undefined, {
      antrag: 'WP-06',
      typ: ['aenderungsantrag'],
    });
    expect(r.documents.map((d) => d.ref).sort()).toEqual(['ag-nrw-a10', 'ag-nrw-a11']);
  });

  it('legt den Live-Status darüber und nennt den alten Stand', async () => {
    const r = await findAntragsgruen(deps(), undefined, { antrag: 'WP-06-001' });
    expect(r.documents[0].content).toContain('Status (live bei Antragsgrün): Übernommen');
    expect(r.documents[0].content).toContain('„Eingereicht"');
    expect(r.documents[0].content).toContain('ein Änderungsantrag ist ein Vorschlag');
  });

  it('antwortet ohne Live-Abfrage mit dem Indexstand', async () => {
    const r = await findAntragsgruen(deps('down'), undefined, { antragsteller: 'Bonn' });
    expect(r.liveOk).toBe(false);
    expect(r.documents.map((d) => d.ref)).toEqual(['ag-nrw-a11']);
    expect(r.documents[0].content).toContain('Status: Eingereicht');
  });

  it('sagt, wenn ein Parteitag nicht aufgenommen ist, statt leer zu suchen', async () => {
    const r = await findAntragsgruen(deps(), 'Klima', { parteitag: 'Troisdorf' });
    expect(r.documents).toEqual([]);
    expect(r.resolved.leer).toContain('kein aufgenommener Parteitag');
    expect(r.resolved.notes.join(' ')).toContain('Troisdorf');
  });

  it('nennt vorhandene Werte, wenn ein Votum nicht passt', async () => {
    const r = await findAntragsgruen(deps(), undefined, { votum: 'Vertagung' });
    expect(r.resolved.leer).toContain('Übernahme');
  });
});

describe('readAntragsgruen', () => {
  it('liest lange Texte mit Frage nur abschnittsweise', async () => {
    const d = deps();
    const r = await readAntragsgruen(d, ['ag-nrw-m1', 'ag-nrw-x9'], 'Wohnen');
    expect(r.missing).toEqual(['ag-nrw-x9']);
    expect(r.documents[0].gekuerzt).toBe(true);
    expect((d.index as ReturnType<typeof fakeIndex>).queries).toEqual(['Wohnen']);
  });

  it('liest kurze Texte ganz', async () => {
    const r = await readAntragsgruen(deps(), ['ag-nrw-a10'], undefined);
    expect(r.documents[0].text).toBe('Kurz [eingefügt: mehr Vielfalt]');
    expect(r.documents[0].gekuerzt).toBe(false);
  });
});

describe('countAntragsgruen', () => {
  it('zählt Änderungsanträge je Antrag', async () => {
    const r = await countAntragsgruen(deps(), 'antrag', {}, 20);
    expect(r.gesamt).toBe(2);
    expect(r.rows).toEqual([{ wert: 'WP-06', anzahl: 2 }]);
  });

  it('zählt Voten und weist Dokumente ohne Votum aus', async () => {
    const r = await countAntragsgruen(deps(), 'votum', {}, 20);
    expect(r.gesamt).toBe(3);
    expect(r.ohneWert).toBe(1);
  });

  it('zählt den Status live über die aufgenommenen Dokumente', async () => {
    const r = await countAntragsgruen(deps(), 'status', {}, 20);
    expect(Object.fromEntries(r.rows.map((x) => [x.wert, x.anzahl]))).toEqual({
      Beschluss: 1,
      Übernommen: 1,
      Eingereicht: 1,
    });
  });

  it('zählt keinen Status, wenn Antragsgrün nicht antwortet', async () => {
    const r = await countAntragsgruen(deps('down'), 'status', {}, 20);
    expect(r.rows).toEqual([]);
    expect(r.notes.join(' ')).toContain('nur live');
  });

  it('nennt Parteitage, die bei Antragsgrün stehen, aber nicht aufgenommen sind', async () => {
    const r = await countAntragsgruen(deps(), 'parteitag', {}, 20);
    expect(r.rows).toEqual([{ wert: 'LDK Essen (2026)', anzahl: 3 }]);
    expect(r.nichtAufgenommen).toEqual([CONSULTATIONS[0].title]);
  });
});
