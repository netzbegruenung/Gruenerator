/**
 * Die drei Chat-Werkzeuge für Antragsgrün (`routes/chat/agents/antragsgruenTools.ts`)
 * laufen über diese Datei: Filter auflösen, im Index finden, lesen, zählen, und
 * den Status live darüberlegen.
 *
 * Arbeitsteilung:
 * - Index (Qdrant): Inhalt, Volltext, Aufzählungen und exakte Zahlen.
 * - Live (Antragsgrün): welche Parteitage es gibt, und der aktuelle Status.
 *
 * Kein Fehlschlag der Live-Abfrage verhindert eine Antwort: dann gilt der Stand
 * des Index, und der Hinweis sagt es.
 */
import { type AntragsgruenInstance } from '../../config/antragsgruenInstances.js';
import { withTimeout } from '../../utils/withTimeout.js';
import {
  PARTEITAGE_CONTENT_TYPE_LABELS,
  type ParteitageContentType,
} from '../scrapers/implementations/ParteitageScraper/builders.js';

import { LIVE_TIMEOUT_MS, type AntragsgruenLive, type LiveEntry } from './live.js';
import { matchConsultations, matchValues, sameKuerzel } from './resolve.js';
import {
  type AgCondition,
  type AgFilter,
  type AgPayload,
  type AntragsgruenIndex,
} from './store.js';

import type { ConsultationRef } from '../scrapers/implementations/ParteitageScraper/antragsgruenClient.js';

export interface AgFilterArgs {
  parteitag?: string | undefined;
  typ?: readonly ParteitageContentType[] | undefined;
  /** Kürzel eines Antrags („WP-06"): der Antrag selbst und seine Änderungsanträge. */
  antrag?: string | undefined;
  antragsteller?: string | undefined;
  votum?: string | undefined;
  tagesordnungspunkt?: string | undefined;
}

export interface AgDeps {
  instance: AntragsgruenInstance;
  index: AntragsgruenIndex;
  live: AntragsgruenLive;
}

export interface ResolvedFilter {
  filter: AgFilter;
  /** Lesbar, für Hinweis und Karte. */
  described: string[];
  notes: string[];
  /** Gesetzt, wenn der Filter nichts treffen KANN — eine Antwort, kein Fehlschlag. */
  leer?: string;
  /** Die `parteitag_id`s, auf die eingegrenzt wurde (leer = alle indizierten). */
  parteitagIds: string[];
}

/** So viele Werte einer Facette reichen zum Auflösen (NRW: ~600 Antragsteller*innen je LDK). */
const RESOLVE_FACET_LIMIT = 5000;
const MAX_LIST = 25;
const MAX_FOUND_DOCS = 12;
const NEAREST_CHUNKS = 80;
const EXCERPT_CHARS = 900;
/** So viele der besten Treffer bekommen ihren ganzen Chunk (höchstens 1600 Zeichen) als Auszug. */
const FULL_EXCERPT_DOCS = 6;
/** Darüber liest `antragsgruen_lesen` nur die passenden Abschnitte bzw. den Anfang. */
export const READ_FULL_CHARS = 12_000;
const READ_CHUNKS = 6;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const strs = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x) : [];

async function liveOrNull<T>(p: () => Promise<T>, label: string): Promise<T | null> {
  try {
    return await withTimeout(p(), LIVE_TIMEOUT_MS, label);
  } catch {
    return null;
  }
}

/** Die indizierten Parteitage (`parteitag_id` → Anzahl Dokumente). */
async function indexedParteitage(deps: AgDeps): Promise<Map<string, number>> {
  const base: AgFilter = { must: [{ key: 'source_id', match: { value: deps.instance.sourceId } }] };
  const hits = await deps.index.facet('parteitag_id', base, 500);
  return new Map(hits.map((h) => [h.value, h.count]));
}

async function resolveValue(
  deps: AgDeps,
  base: AgFilter,
  key: string,
  wanted: string,
  label: string
): Promise<{ condition: AgCondition | null; note: string | null; leer: string | null }> {
  const values = (await deps.index.facet(key, base, RESOLVE_FACET_LIMIT)).map((h) => h.value);
  const matched = matchValues(wanted, values);
  if (matched.length === 0) {
    const beispiele = values.slice(0, 8).join('; ');
    return {
      condition: null,
      note: null,
      leer: `Kein Eintrag mit ${label} „${wanted}"${beispiele ? `. Vorhanden sind z. B.: ${beispiele}` : ''}.`,
    };
  }
  return {
    condition: { key, match: { any: matched } },
    note:
      matched.length > 1 || matched[0] !== wanted
        ? `${label} „${wanted}" gelesen als: ${matched.slice(0, 6).join('; ')}${matched.length > 6 ? ` (+${matched.length - 6})` : ''}.`
        : null,
    leer: null,
  };
}

export async function resolveFilter(deps: AgDeps, args: AgFilterArgs): Promise<ResolvedFilter> {
  const { instance } = deps;
  const must: AgCondition[] = [{ key: 'source_id', match: { value: instance.sourceId } }];
  const described: string[] = [];
  const notes: string[] = [];
  let parteitagIds: string[] = [];
  const indexed = await indexedParteitage(deps);
  const empty = (leer: string): ResolvedFilter => ({
    filter: { must },
    described,
    notes,
    leer,
    parteitagIds,
  });

  if (args.parteitag) {
    const refs = await liveOrNull(() => deps.live.consultations(), 'antragsgruen consultations');
    const known: ConsultationRef[] = refs ?? [];
    let matched = matchConsultations(args.parteitag, known).map(
      (r) => `${instance.id}/${r.url_path}`
    );
    if (refs == null) {
      // Ohne Live-Liste: gegen die indizierten Kennungen (`nrw/ldk26-02`) und Labels.
      notes.push('Die Parteitagsliste von Antragsgrün war gerade nicht erreichbar.');
      matched = [...indexed.keys()].filter((id) =>
        id.toLowerCase().includes(args.parteitag!.trim().toLowerCase())
      );
    }
    const inIndex = matched.filter((id) => indexed.has(id));
    const missing = matched.filter((id) => !indexed.has(id));
    if (missing.length > 0) {
      const titles = missing.map((id) => {
        const ref = known.find((r) => `${instance.id}/${r.url_path}` === id);
        return ref ? ref.title : id;
      });
      notes.push(
        `Nicht im Grünerator aufgenommen (vorerst nur ausgewählte Parteitage, nicht öffentliche nie): ${titles.join('; ')}. Deren Inhalte kann dieses Werkzeug nicht durchsuchen; die Seite ist ${`https://${instance.host}`}.`
      );
    }
    if (inIndex.length === 0) {
      return empty(
        `Zu „${args.parteitag}" liegt kein aufgenommener Parteitag vor. Aufgenommen: ${[...indexed.keys()].join(', ') || 'keiner'}.`
      );
    }
    parteitagIds = inIndex;
    must.push({ key: 'parteitag_id', match: { any: inIndex } });
    described.push(`Parteitag: ${inIndex.join(', ')}`);
  }

  // Vor dem Typfilter: „WP-06" ist das Kürzel des Antrags, auch wenn nur seine
  // Änderungsanträge gefragt sind (die tragen „WP-06-123" bzw. `antrag_kuerzel`).
  const scope: AgFilter = { must: [...must] };

  if (args.typ && args.typ.length > 0) {
    must.push({ key: 'content_type', match: { any: [...args.typ] } });
    described.push(`Typ: ${args.typ.map((t) => PARTEITAGE_CONTENT_TYPE_LABELS[t]).join(', ')}`);
  }

  if (args.antrag) {
    const wanted = args.antrag;
    const [own, parents] = await Promise.all([
      deps.index.facet('kuerzel', scope, RESOLVE_FACET_LIMIT),
      deps.index.facet('antrag_kuerzel', scope, RESOLVE_FACET_LIMIT),
    ]);
    const hit = [...new Set([...own, ...parents].map((h) => h.value))].filter((k) =>
      sameKuerzel(k, wanted)
    );
    if (hit.length === 0) {
      return empty(`Kein Antrag mit dem Kürzel „${args.antrag}" in den aufgenommenen Parteitagen.`);
    }
    // Der Antrag selbst (bzw. sein Beschluss) und alle Änderungsanträge dazu.
    must.push({
      should: [
        { key: 'kuerzel', match: { any: hit } },
        { key: 'antrag_kuerzel', match: { any: hit } },
      ],
    } as AgCondition);
    described.push(`Antrag: ${hit.join(', ')}`);
  }

  for (const [key, wanted, label] of [
    ['antragsteller', args.antragsteller, 'Antragsteller*in'],
    ['votum', args.votum, 'Verfahrensvorschlag'],
    ['tagesordnungspunkt', args.tagesordnungspunkt, 'Tagesordnungspunkt'],
  ] as const) {
    if (!wanted) continue;
    const r = await resolveValue(deps, { must: [...must] }, key, wanted, label);
    if (r.leer) return empty(r.leer);
    if (r.condition) must.push(r.condition);
    if (r.note) notes.push(r.note);
    described.push(`${label}: ${wanted}`);
  }

  return { filter: { must }, described, notes, parteitagIds };
}

// ── Live-Status ─────────────────────────────────────────────────────────────

export interface LiveStatus {
  /** documentId → aktueller Status; `null`, wenn die Abfrage scheiterte. */
  byId: Map<string, LiveEntry> | null;
}

async function liveStatus(deps: AgDeps, parteitagIds: readonly string[]): Promise<LiveStatus> {
  const prefix = `${deps.instance.id}/`;
  const paths = [...new Set(parteitagIds)]
    .filter((id) => id.startsWith(prefix))
    .map((id) => id.slice(prefix.length));
  if (paths.length === 0) return { byId: new Map() };
  const lists = await Promise.all(
    paths.map((p) => liveOrNull(() => deps.live.entries(p), `antragsgruen ${p}`))
  );
  if (lists.some((l) => l == null)) return { byId: null };
  const byId = new Map<string, LiveEntry>();
  for (const list of lists) for (const e of list ?? []) byId.set(e.documentId, e);
  return { byId };
}

function statusLine(p: AgPayload, live: LiveStatus): string | null {
  const indexed = str(p.status);
  const current = live.byId?.get(str(p.document_id))?.status;
  if (current && indexed && current !== indexed) {
    return `Status (live bei Antragsgrün): ${current} — der Grünerator-Stand von heute Nacht war „${indexed}"`;
  }
  const s = current ?? indexed;
  return s ? `Status: ${s}` : null;
}

// ── Listenzeilen ────────────────────────────────────────────────────────────

export interface AgDocument {
  ref: string;
  title: string;
  url: string;
  /** Mehrzeilig, für die Quellenliste des Modells. */
  content: string;
  typ: string;
  parteitag: string;
  status: string | null;
}

function people(p: AgPayload): string | null {
  const names = strs(p.antragsteller);
  if (names.length === 0) return null;
  const shown = names.slice(0, 5).join(', ');
  return `Antragsteller*innen: ${shown}${names.length > 5 ? ` (+${names.length - 5})` : ''}`;
}

function dateLine(p: AgPayload): string | null {
  const beschlossen = str(p.beschlossen_am);
  if (beschlossen) {
    const durch = str(p.beschluss_durch);
    const quelle = p.beschlussdatum_quelle === 'veranstaltung' ? ' (Tag der Veranstaltung)' : '';
    return `Beschlossen am ${beschlossen}${quelle}${durch ? ` durch ${durch}` : ''}`;
  }
  const eingereicht = str(p.eingereicht_am);
  return eingereicht ? `Eingereicht am ${eingereicht}` : null;
}

export function toDocument(p: AgPayload, live: LiveStatus, extra: string[] = []): AgDocument {
  const type = str(p.content_type) as ParteitageContentType;
  const typ = PARTEITAGE_CONTENT_TYPE_LABELS[type] ?? type;
  const status = statusLine(p, live);
  const lines = [
    str(p.title),
    `${typ} · ${str(p.parteitag)}${p.kuerzel ? ` · Kürzel ${str(p.kuerzel)}` : ''}`,
    type === 'aenderungsantrag' && p.antrag_kuerzel
      ? `Zu Antrag ${str(p.antrag_kuerzel)}${p.antrag_titel ? `: ${str(p.antrag_titel)}` : ''} — ein Änderungsantrag ist ein Vorschlag, kein beschlossener Text`
      : null,
    type === 'antrag' && p.neueste_fassung_id
      ? `Eingereichte Fassung; die beschlossene Fassung hat Ref ${str(p.neueste_fassung_id)}`
      : null,
    people(p),
    status,
    p.votum ? `Verfahrensvorschlag der Antragskommission (Empfehlung): ${str(p.votum)}` : null,
    p.tagesordnungspunkt ? `Tagesordnungspunkt: ${str(p.tagesordnungspunkt)}` : null,
    dateLine(p),
    `Ref: ${str(p.document_id)}`,
    ...extra,
  ].filter((l): l is string => !!l);
  return {
    ref: str(p.document_id),
    title: str(p.title),
    url: str(p.source_url),
    content: lines.join('\n'),
    typ,
    parteitag: str(p.parteitag),
    status: live.byId?.get(str(p.document_id))?.status ?? (str(p.status) || null),
  };
}

// ── Finden ──────────────────────────────────────────────────────────────────

export interface AgFindResult {
  documents: AgDocument[];
  /** Exakte Zahl der Dokumente, die die Filter treffen (ohne Thema). */
  gesamt: number;
  ranked: boolean;
  resolved: ResolvedFilter;
  liveOk: boolean;
}

export async function findAntragsgruen(
  deps: AgDeps,
  query: string | undefined,
  args: AgFilterArgs
): Promise<AgFindResult> {
  const resolved = await resolveFilter(deps, args);
  if (resolved.leer) {
    return { documents: [], gesamt: 0, ranked: false, resolved, liveOk: true };
  }
  const [gesamt, rows] = await Promise.all([
    deps.index.count(resolved.filter),
    query
      ? deps.index.nearest(query, resolved.filter, NEAREST_CHUNKS)
      : deps.index.latest(resolved.filter, MAX_LIST),
  ]);
  // Je Dokument der beste Chunk; die Reihenfolge der Nähe bleibt.
  const best = new Map<string, AgPayload>();
  for (const row of rows) {
    const id = str(row.document_id);
    if (id && !best.has(id)) best.set(id, row);
  }
  const picked = [...best.values()].slice(0, query ? MAX_FOUND_DOCS : MAX_LIST);
  const live = await liveStatus(
    deps,
    picked.map((p) => str(p.parteitag_id))
  );
  const documents = picked.map((p, i) => {
    const excerpt = str(p.chunk_text).trim();
    // Die besten Treffer mit ganzem Chunk: der passende Satz steht oft in seiner zweiten Hälfte.
    const cap = i < FULL_EXCERPT_DOCS ? excerpt.length : EXCERPT_CHARS;
    return toDocument(p, live, query && excerpt ? [`Auszug: ${excerpt.slice(0, cap)}`] : []);
  });
  return { documents, gesamt, ranked: !!query, resolved, liveOk: live.byId != null };
}

// ── Lesen ───────────────────────────────────────────────────────────────────

const fp = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
/** So viele Zeichen (nach `fp`) genügen, um einen Chunk-Anfang bzw. -Schluss im Absatz wiederzufinden. */
const ANCHOR = 60;

/**
 * Die Absätze aus `full_text`, in denen die gefundenen Chunks liegen — ganz,
 * mit Zeilenmarke (`[Z. a–b]`) und der Überschrift davor, Lücken als „[…]".
 * Chunks überlappen sich und beginnen oft mitten im Absatz; als Text
 * aneinandergehängt, standen Sätze doppelt und ohne ihre Zeilen da.
 */
export function passagesOf(full: string, chunks: readonly string[]): string {
  const paragraphs = full.split(/\n{2,}/);
  const prints = paragraphs.map(fp);
  const picked = new Set<number>();
  const unmatched: string[] = [];
  for (const chunk of chunks) {
    const c = fp(chunk);
    if (!c) continue;
    const head = c.slice(0, ANCHOR);
    const tail = c.slice(-ANCHOR);
    // Ein ganz kurzer Absatz (eine Überschrift) steckt in vielen Chunks; er zählt nur über Anfang/Schluss.
    const hits = prints.flatMap((p, i) =>
      (p.length >= ANCHOR / 3 && c.includes(p)) || p.includes(head) || p.includes(tail) ? [i] : []
    );
    if (hits.length === 0) {
      unmatched.push(chunk.trim());
      continue;
    }
    // Alles zwischen erstem und letztem Treffer: der Chunk spannt über diese Absätze.
    for (let i = Math.min(...hits); i <= Math.max(...hits); i++) picked.add(i);
  }
  // Die Überschrift über jeder Stelle gehört dazu: ohne sie fehlt der Abschnitt.
  for (const i of [...picked]) {
    for (let h = i - 1; h >= 0; h--) {
      if (paragraphs[h].startsWith('#')) {
        picked.add(h);
        break;
      }
    }
  }
  const order = [...picked].sort((a, b) => a - b);
  const out: string[] = [];
  order.forEach((i, k) => {
    if (k > 0 && i !== order[k - 1] + 1) out.push('[…]');
    out.push(paragraphs[i]);
  });
  return [...out, ...unmatched].join('\n\n').slice(0, READ_FULL_CHARS);
}

export interface AgReadResult {
  documents: Array<AgDocument & { text: string; gekuerzt: boolean }>;
  missing: string[];
  liveOk: boolean;
}

export async function readAntragsgruen(
  deps: AgDeps,
  refs: readonly string[],
  frage: string | undefined
): Promise<AgReadResult> {
  const heads = await deps.index.heads(refs);
  const byId = new Map(heads.map((h) => [str(h.document_id), h]));
  const missing = refs.filter((r) => !byId.has(r));
  const found = refs.flatMap((r) => (byId.has(r) ? [byId.get(r)!] : []));
  const live = await liveStatus(
    deps,
    found.map((p) => str(p.parteitag_id))
  );
  const documents = await Promise.all(
    found.map(async (p) => {
      const full = str(p.full_text);
      let text = full;
      let gekuerzt = false;
      if (full.length > READ_FULL_CHARS) {
        gekuerzt = true;
        if (frage) {
          const filter: AgFilter = {
            must: [
              { key: 'source_id', match: { value: deps.instance.sourceId } },
              { key: 'document_id', match: { value: str(p.document_id) } },
            ],
          };
          const chunks = await deps.index.nearest(frage, filter, READ_CHUNKS);
          text = passagesOf(
            full,
            chunks.map((c) => str(c.chunk_text))
          );
        } else {
          text = full.slice(0, READ_FULL_CHARS);
        }
      }
      return { ...toDocument(p, live), text, gekuerzt };
    })
  );
  return { documents, missing, liveOk: live.byId != null };
}

// ── Auswerten ───────────────────────────────────────────────────────────────

export const AUSWERTUNG_NACH = [
  'parteitag',
  'antrag',
  'antragsteller',
  'votum',
  'tagesordnungspunkt',
  'typ',
  'status',
] as const;
export type AuswertungNach = (typeof AUSWERTUNG_NACH)[number];

const FACET_KEY: Record<Exclude<AuswertungNach, 'status' | 'parteitag'>, string> = {
  antrag: 'antrag_kuerzel',
  antragsteller: 'antragsteller',
  votum: 'votum',
  tagesordnungspunkt: 'tagesordnungspunkt',
  typ: 'content_type',
};

export interface AgCountResult {
  nach: AuswertungNach;
  gesamt: number;
  rows: Array<{ wert: string; anzahl: number }>;
  /** Dokumente ohne Wert (z. B. ohne Verfahrensvorschlag); nur bei einwertigen Feldern. */
  ohneWert: number | null;
  notes: string[];
  resolved: ResolvedFilter;
  /** Nur `nach: 'parteitag'`: Parteitage bei Antragsgrün, die nicht aufgenommen sind. */
  nichtAufgenommen: string[];
}

export async function countAntragsgruen(
  deps: AgDeps,
  nach: AuswertungNach,
  args: AgFilterArgs,
  top: number
): Promise<AgCountResult> {
  // „Wie viele ÄAs je Antrag": ohne Typfilter zählte die Facette nur ÄAs ohnehin
  // (nur sie tragen `antrag_kuerzel`); der Filter macht es ausdrücklich.
  const filterArgs: AgFilterArgs =
    nach === 'antrag' && !args.typ?.length ? { ...args, typ: ['aenderungsantrag'] } : args;
  const resolved = await resolveFilter(deps, filterArgs);
  const notes = [...resolved.notes];
  const base = {
    nach,
    notes,
    resolved,
    nichtAufgenommen: [] as string[],
  };
  if (resolved.leer) return { ...base, gesamt: 0, rows: [], ohneWert: null };
  const gesamt = await deps.index.count(resolved.filter);

  if (nach === 'status') {
    const ids = new Set(await deps.index.documentIds(resolved.filter));
    const scope =
      resolved.parteitagIds.length > 0
        ? resolved.parteitagIds
        : [...(await indexedParteitage(deps)).keys()];
    const live = await liveStatus(deps, scope);
    if (!live.byId) {
      return {
        ...base,
        notes: [
          ...notes,
          'Der aktuelle Status ist nur live bei Antragsgrün abrufbar, und das ging gerade nicht. Später noch einmal versuchen.',
        ],
        gesamt,
        rows: [],
        ohneWert: null,
      };
    }
    const counts = new Map<string, number>();
    let unbekannt = 0;
    for (const id of ids) {
      const s = live.byId.get(id)?.status;
      if (!s) unbekannt += 1;
      else counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    notes.push('Status live von Antragsgrün, gezählt über die aufgenommenen Dokumente.');
    if (unbekannt > 0) {
      notes.push(
        `${unbekannt} Dokumente stehen bei Antragsgrün nicht mehr in der Übersicht (zurückgezogen oder entfernt).`
      );
    }
    const rows = [...counts]
      .sort((a, b) => b[1] - a[1])
      .slice(0, top)
      .map(([wert, anzahl]) => ({ wert, anzahl }));
    return { ...base, gesamt, rows, ohneWert: null };
  }

  if (nach === 'parteitag') {
    const hits = await deps.index.facet('parteitag', resolved.filter, top);
    const refs = await liveOrNull(() => deps.live.consultations(), 'antragsgruen consultations');
    const indexed = await indexedParteitage(deps);
    const nichtAufgenommen = (refs ?? [])
      .filter((r) => !indexed.has(`${deps.instance.id}/${r.url_path}`))
      .map((r) => r.title);
    if (refs == null)
      notes.push('Die Parteitagsliste von Antragsgrün war gerade nicht erreichbar.');
    return {
      ...base,
      gesamt,
      rows: hits.map((h) => ({ wert: h.value, anzahl: h.count })),
      ohneWert: null,
      nichtAufgenommen,
    };
  }

  // Vollständig zählen, dann kürzen: nur so stimmen Klassen und „ohne Angabe".
  const hits = await deps.index.facet(FACET_KEY[nach], resolved.filter, RESOLVE_FACET_LIMIT);
  const grouped = new Map<string, number>();
  for (const h of hits) {
    const wert = labelOf(nach, h.value);
    grouped.set(wert, (grouped.get(wert) ?? 0) + h.count);
  }
  const all = [...grouped].sort((a, b) => b[1] - a[1]).map(([wert, anzahl]) => ({ wert, anzahl }));
  if (nach === 'antragsteller') {
    notes.push(
      'Ein Antrag mit mehreren Antragsteller*innen zählt bei jeder*jedem mit; die Summe ist deshalb größer als die Gesamtzahl.'
    );
  }
  if (all.length > top) notes.push(`${all.length - top} weitere Werte mit kleineren Zahlen.`);
  // Einwertige Felder: was keinen Wert trägt, ist „ohne Angabe".
  const sum = all.reduce((n, r) => n + r.anzahl, 0);
  const ohneWert = nach === 'antragsteller' ? null : Math.max(0, gesamt - sum);
  return { ...base, gesamt, rows: all.slice(0, top), ohneWert };
}

/** Ein Votum „Erledigt durch: L-02-013" ist je Ziel ein eigener Wert; gezählt wird die Klasse. */
const ERLEDIGT_DURCH = /^erledigt durch\b/i;

function labelOf(nach: AuswertungNach, value: string): string {
  if (nach === 'typ') {
    return PARTEITAGE_CONTENT_TYPE_LABELS[value as ParteitageContentType] ?? value;
  }
  if (nach === 'votum' && ERLEDIGT_DURCH.test(value)) {
    return 'Erledigt durch einen anderen Änderungsantrag';
  }
  return value;
}
