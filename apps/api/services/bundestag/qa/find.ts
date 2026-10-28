/**
 * Stufe „find": aus den Filtern der Planung werden Kandidaten (Drucksachen
 * und Beratungsabschnitte) bei DIP gesucht. Der Volltext wird hier nie
 * angefasst — `drucksache-text?f.vorgang=` ignoriert DIP und liefert die
 * gesamte Liste (~290k Dokumente), deshalb geht der Weg zu den Dokumenten
 * eines Vorgangs ausschliesslich über `vorgangsposition`.
 */
import {
  type BundestagCandidate,
  type BundestagFilter,
  type BtSemanticHit,
} from '@gruenerator/contracts';

import {
  type DipDrucksache,
  type DipListPage,
  type DipParams,
  type DipVorgang,
  type DipVorgangsposition,
  type DipEndpoint,
} from '../dip/dipClient.js';

import { type Budget } from './budget.js';

/** Soviele Vorgänge werden pro Suche zu Positionen ausgeklappt. */
const MAX_EXPANDED_VORGAENGE = 8;
/** Darunter gilt die Suche als zu dünn und löst Wiederholung bzw. MCP-Rückfall aus. */
const MIN_CANDIDATES = 3;
const MCP_LIMIT = 10;
/** Dokumentarten, deren Urheber der Initiator des Vorgangs ist; bei anderen (Antwort, Beschlussempfehlung …) weicht er ab. */
const INITIATOR_TYPES = [
  'Antrag',
  'Gesetzentwurf',
  'Kleine Anfrage',
  'Große Anfrage',
  'Entschließungsantrag',
  'Änderungsantrag',
];
/** Bei gesetztem `beratungsstand` zuerst die Dokumente, die den Beschluss tragen; Anfragen zuletzt. */
const DECISION_RANK: Record<string, number> = {
  'Beschlussempfehlung und Bericht': 0,
  Gesetzentwurf: 1,
  Antrag: 2,
  Entschließungsantrag: 2,
  Änderungsantrag: 2,
  'Kleine Anfrage': 4,
  'Große Anfrage': 4,
  Antwort: 4,
};
const NUMMER_RE = /^\d{1,2}\/\d{1,6}$/;

export interface FindDip {
  list<T>(endpoint: DipEndpoint, params: DipParams): Promise<DipListPage<T>>;
}

export interface FindMcp {
  semanticSearch(opts: {
    query: string;
    wahlperiode?: number;
    limit?: number;
  }): Promise<{ items: BtSemanticHit[] }>;
}

export interface FindResult {
  candidates: BundestagCandidate[];
  totals: { vorgaenge: number; drucksachen: number };
  notes: string[];
}

export function drucksacheRef(dokumentnummer: string): string {
  return dokumentnummer;
}

/** `PlPr 21/80 S. 9553-9572` — `protokollNummer` ist die Dokumentnummer des Protokolls („21/80"). */
export function beratungRef(
  protokollNummer: string,
  anfangsseite: number,
  endseite: number
): string {
  return `PlPr ${protokollNummer} S. ${anfangsseite}-${endseite}`;
}

/** Leere Arrays heissen bei DIP „kein Filter" — der Schlüssel fehlt dann ganz. */
function withList(
  params: DipParams,
  key: string,
  values: readonly (string | number)[] | undefined
) {
  if (values && values.length > 0) params[key] = values;
}

function baseParams(f: BundestagFilter, wahlperiode: readonly number[] | undefined): DipParams {
  const params: DipParams = { 'f.zuordnung': 'BT' };
  withList(params, 'f.wahlperiode', wahlperiode);
  if (f.datumVon) params['f.datum.start'] = f.datumVon;
  if (f.datumBis) params['f.datum.end'] = f.datumBis;
  if (f.titel) params['f.titel'] = f.titel;
  return params;
}

function fromDrucksache(d: DipDrucksache): BundestagCandidate {
  return {
    ref: drucksacheRef(d.dokumentnummer),
    dipId: d.id,
    kind: 'drucksache',
    dokumentnummer: d.dokumentnummer,
    drucksachetyp: d.drucksachetyp ?? '',
    titel: d.titel ?? '',
    datum: d.datum ?? '',
    urheber: (d.urheber ?? []).flatMap((u) => (u.titel ? [u.titel] : [])),
    pdfUrl: d.fundstelle?.pdf_url ?? null,
    vorgangId: d.vorgangsbezug?.[0]?.id ?? null,
    vorgangTitel: d.vorgangsbezug?.[0]?.titel ?? null,
    abstract: null,
    aktualisiert: d.aktualisiert ?? null,
    beratung: null,
  };
}

/** Eine Position wird zur Drucksache, zur Beratung oder (ohne Fundstelle) zu nichts. */
function fromPosition(
  p: DipVorgangsposition,
  v: VorgangRef,
  includeBeratung: boolean,
  types: readonly string[] | undefined
): BundestagCandidate | null {
  const fs = p.fundstelle;
  if (!fs?.id || !fs.dokumentnummer) return null;
  const common = {
    dipId: fs.id,
    datum: p.datum ?? '',
    urheber: fs.urheber && fs.urheber.length > 0 ? fs.urheber : (v.initiative ?? []),
    vorgangId: v.id,
    vorgangTitel: v.titel ?? null,
    abstract: v.abstract ?? null,
    aktualisiert: null,
    pdfUrl: fs.pdf_url ?? null,
  };
  if (fs.xml_url && fs.anfangsseite != null && fs.endseite != null) {
    if (!includeBeratung) return null;
    return {
      ...common,
      ref: beratungRef(fs.dokumentnummer, fs.anfangsseite, fs.endseite),
      kind: 'beratung',
      dokumentnummer: fs.dokumentnummer,
      drucksachetyp: 'Plenarprotokoll',
      titel: [p.vorgangsposition, v.titel].filter(Boolean).join(' – '),
      beratung: { xmlUrl: fs.xml_url, anfangsseite: fs.anfangsseite, endseite: fs.endseite },
    };
  }
  if (!fs.drucksachetyp) return null;
  if (types && types.length > 0 && !types.includes(fs.drucksachetyp)) return null;
  return {
    ...common,
    ref: drucksacheRef(fs.dokumentnummer),
    kind: 'drucksache',
    dokumentnummer: fs.dokumentnummer,
    drucksachetyp: fs.drucksachetyp,
    titel: v.titel ?? '',
    beratung: null,
  };
}

function urheberMatches(have: readonly string[], want: readonly string[]): boolean {
  const norm = (x: string) => x.toLowerCase();
  return want.some((w) => have.some((h) => norm(h).includes(norm(w)) || norm(w).includes(norm(h))));
}

/** Meldet, dass eine Position ohne Urheber trotz Urheber-Filter behalten wurde. */
interface UrheberSink {
  missing: boolean;
}

/**
 * `urheber` filtert die ausgeklappten Drucksachen, wenn der Vorgang nicht über
 * `f.initiative` eingegrenzt werden konnte. Positionen ohne Urheber-Angabe
 * bleiben (nichts still verwerfen) und werden einmal angemerkt.
 */
async function positionsOf(
  dip: FindDip,
  vorgang: VorgangRef,
  f: BundestagFilter,
  urheber?: { want: readonly string[]; sink: UrheberSink }
): Promise<BundestagCandidate[]> {
  const page = await dip.list<DipVorgangsposition>('vorgangsposition', {
    'f.vorgang': vorgang.id,
    'f.zuordnung': 'BT',
  });
  return page.documents.flatMap((p) => {
    const c = fromPosition(p, vorgang, f.mitBeratung === true, f.drucksachetyp);
    if (!c) return [];
    if (urheber && c.kind === 'drucksache') {
      const own = p.fundstelle?.urheber;
      if (!own || own.length === 0) urheber.sink.missing = true;
      else if (!urheberMatches(own, urheber.want)) return [];
    }
    return [c];
  });
}

/** Was von einem Vorgang an den Kandidaten weitergereicht wird. */
interface VorgangRef {
  id: string;
  titel?: string | undefined;
  initiative?: string[] | undefined;
  abstract?: string | undefined;
}

interface Collected {
  notes?: string[];
  candidates: BundestagCandidate[];
  vorgaenge: number;
  drucksachen: number | null;
}

/** Eine Nummer: die Drucksache selbst, dann ihre Geschwister aus demselben Vorgang. */
async function byNummer(dip: FindDip, f: BundestagFilter): Promise<Collected> {
  const page = await dip.list<DipDrucksache>('drucksache', {
    'f.zuordnung': 'BT',
    'f.dokumentnummer': f.dokumentnummer ?? [],
  });
  const own = page.documents.map(fromDrucksache);
  const siblings: BundestagCandidate[] = [];
  const seenVorgang = new Set<string>();
  const notes: string[] = [];
  const wantsAntwort = f.drucksachetyp?.includes('Antwort') === true;
  for (const d of page.documents) {
    const bezug = d.vorgangsbezug?.[0];
    if (!bezug || seenVorgang.has(bezug.id)) continue;
    seenVorgang.add(bezug.id);
    const found = await positionsOf(dip, { id: bezug.id, titel: bezug.titel }, f);
    siblings.push(...found);
    if (
      wantsAntwort &&
      d.drucksachetyp !== 'Antwort' &&
      !found.some((c) => c.drucksachetyp === 'Antwort')
    ) {
      notes.push(`Zu Drucksache ${d.dokumentnummer} liegt im DIP noch keine Antwort vor.`);
    }
  }
  return {
    notes,
    candidates: [...own, ...siblings],
    vorgaenge: seenVorgang.size,
    drucksachen: page.numFound,
  };
}

async function byVorgang(
  dip: FindDip,
  f: BundestagFilter,
  wahlperiode: readonly number[] | undefined
): Promise<Collected> {
  const params = baseParams(f, wahlperiode);
  withList(params, 'f.deskriptor', f.deskriptor);
  // Nur bei Typen, die der Initiator des Vorgangs verfasst, ist `urheber` = `f.initiative`.
  const types = f.drucksachetyp ?? [];
  const byInitiative = types.length === 0 || types.every((t) => INITIATOR_TYPES.includes(t));
  const filterUrheber = !byInitiative && (f.urheber?.length ?? 0) > 0;
  if (byInitiative) withList(params, 'f.initiative', f.urheber);
  withList(params, 'f.beratungsstand', f.beratungsstand);
  const page = await dip.list<DipVorgang>('vorgang', params);
  const sink: UrheberSink = { missing: false };
  const urheber = filterUrheber && f.urheber ? { want: f.urheber, sink } : undefined;
  const candidates: BundestagCandidate[] = [];
  for (const v of page.documents.slice(0, MAX_EXPANDED_VORGAENGE)) {
    candidates.push(...(await positionsOf(dip, v, f, urheber)));
  }
  const notes = sink.missing
    ? [
        'Bei einigen Dokumenten fehlt im DIP die Urheber-Angabe; sie wurden nicht nach Urheber gefiltert.',
      ]
    : [];
  if (f.beratungsstand && f.beratungsstand.length > 0) {
    // Stabil: innerhalb eines Rangs bleibt die DIP-Reihenfolge der Vorgänge.
    const rank = (c: BundestagCandidate) => DECISION_RANK[c.drucksachetyp] ?? 3;
    candidates.sort((a, b) => rank(a) - rank(b));
  }
  return { notes, candidates, vorgaenge: page.numFound, drucksachen: null };
}

async function byDrucksache(
  dip: FindDip,
  f: BundestagFilter,
  wahlperiode: readonly number[] | undefined
): Promise<Collected> {
  const params = baseParams(f, wahlperiode);
  withList(params, 'f.drucksachetyp', f.drucksachetyp);
  withList(params, 'f.urheber', f.urheber);
  const page = await dip.list<DipDrucksache>('drucksache', params);
  return {
    candidates: page.documents.map(fromDrucksache),
    vorgaenge: 0,
    drucksachen: page.numFound,
  };
}

async function collect(
  dip: FindDip,
  f: BundestagFilter,
  wahlperiode: readonly number[] | undefined
): Promise<Collected> {
  if (f.dokumentnummer && f.dokumentnummer.length > 0) return byNummer(dip, f);
  const hasTypes = (f.drucksachetyp?.length ?? 0) > 0;
  const hasUrheber = (f.urheber?.length ?? 0) > 0;
  const viaVorgang =
    (f.deskriptor?.length ?? 0) > 0 ||
    Boolean(f.titel) ||
    (f.beratungsstand?.length ?? 0) > 0 ||
    (hasUrheber && !hasTypes);
  return viaVorgang ? byVorgang(dip, f, wahlperiode) : byDrucksache(dip, f, wahlperiode);
}

/** Entfernt Duplikate nach `ref` und behält die Reihenfolge. */
function dedupe(list: BundestagCandidate[]): BundestagCandidate[] {
  const seen = new Set<string>();
  // `dipId` taugt nicht: eine Beratung trägt die Id des Protokolls, mehrere Debatten teilen sie.
  return list.filter((c) => (seen.has(c.ref) ? false : (seen.add(c.ref), true)));
}

/** Unterscheidet einen MCP-Ausfall von einem DIP-Fehler im Rückfall. */
class McpUnavailableError extends Error {}

/** Rückfall über die semantische Suche: Treffer → Dokumentnummern → Metadaten bei DIP. */
async function viaMcp(
  question: string,
  f: BundestagFilter,
  wahlperiode: number | null,
  dip: FindDip,
  mcp: FindMcp
): Promise<BundestagCandidate[]> {
  let items: BtSemanticHit[];
  try {
    ({ items } = await mcp.semanticSearch({
      query: question,
      ...(wahlperiode != null ? { wahlperiode } : {}),
      limit: MCP_LIMIT,
    }));
  } catch {
    throw new McpUnavailableError();
  }
  const nummern = [
    ...new Set(
      items.flatMap((h) =>
        h.dokumentnummer && NUMMER_RE.test(h.dokumentnummer) ? [h.dokumentnummer] : []
      )
    ),
  ];
  if (nummern.length === 0) return [];
  const params: DipParams = { 'f.zuordnung': 'BT', 'f.dokumentnummer': nummern };
  withList(params, 'f.drucksachetyp', f.drucksachetyp);
  const page = await dip.list<DipDrucksache>('drucksache', params);
  // Reihenfolge der Treffer (Relevanz) bleibt erhalten.
  const byNummerMap = new Map(page.documents.map((d) => [d.dokumentnummer, d]));
  return nummern.flatMap((n) => {
    const d = byNummerMap.get(n);
    return d ? [fromDrucksache(d)] : [];
  });
}

export async function findCandidates(args: {
  question: string;
  filters: BundestagFilter;
  assumedWahlperiode: boolean;
  budget: Budget;
  dip: FindDip;
  mcp: FindMcp;
}): Promise<FindResult> {
  const { question, filters, assumedWahlperiode, budget, dip, mcp } = args;
  const notes: string[] = [];
  const hasNummer = (filters.dokumentnummer?.length ?? 0) > 0;

  const first = await collect(dip, filters, filters.wahlperiode);
  notes.push(...(first.notes ?? []));
  let candidates = dedupe(first.candidates);
  const totals = { vorgaenge: first.vorgaenge, drucksachen: first.drucksachen ?? 0 };
  let droppedWahlperiode = false;

  if (!hasNummer && candidates.length < MIN_CANDIDATES) {
    if (assumedWahlperiode && (filters.wahlperiode?.length ?? 0) > 0) {
      const retry = await collect(dip, filters, undefined);
      candidates = dedupe([...candidates, ...retry.candidates]);
      totals.vorgaenge = Math.max(totals.vorgaenge, retry.vorgaenge);
      totals.drucksachen = Math.max(totals.drucksachen, retry.drucksachen ?? 0);
      droppedWahlperiode = true;
      notes.push('Wenig Treffer in der angenommenen Wahlperiode, daher ohne Wahlperiode gesucht.');
    }
    if (candidates.length < MIN_CANDIDATES) {
      try {
        const wp = droppedWahlperiode ? null : (filters.wahlperiode?.[0] ?? null);
        const extra = await viaMcp(question, filters, wp, dip, mcp);
        if (extra.length > 0) {
          candidates = dedupe([...candidates, ...extra]);
          notes.push('Wenig Treffer bei DIP, ergänzt durch die semantische Suche.');
        }
      } catch (error: unknown) {
        notes.push(
          error instanceof McpUnavailableError
            ? 'Die semantische Suche war nicht erreichbar.'
            : 'Die Abfrage der Treffer der semantischen Suche bei DIP ist fehlgeschlagen.'
        );
      }
    }
  }

  if (!totals.drucksachen) totals.drucksachen = candidates.length;
  return { candidates: candidates.slice(0, budget.maxDocuments), totals, notes };
}
