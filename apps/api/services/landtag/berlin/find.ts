/**
 * Stufe „find" für das Abgeordnetenhaus: normalisierte Filter → PARDOK-Abfragen
 * → Kandidaten (nur Metadaten). Der Volltext wird hier nie geholt.
 *
 * Was PARDOK nicht kann, löst dieser Code ausdrücklich und sagt es:
 *  - `f.urheber` ist UND und `f.drucksachtyp` nimmt nur den letzten Wert:
 *    ODER-Listen laufen als eine Abfrage je Wertekombination.
 *  - `f.urheber` kennt nur Körperschaften. Schriftliche Anfragen tragen die
 *    fragende Person samt Fraktion — dafür wird lokal an den neuesten Treffern
 *    gefiltert, und der Hinweis nennt die Grenze.
 *  - Titel und Volltext: `f.titel` ist ODER über Teilstrings, `f.volltext`
 *    nimmt GENAU EINEN Begriff (mehr gibt HTTP 400) und braucht Sekunden.
 */
import { type BundestagCandidate, type LandtagFilter } from '@gruenerator/contracts';

import { keywordsFromQuestion } from '../../bundestag/qa/plan.js';
import {
  TOOL_TIMEOUT_OVERRIDES_MS,
  DEFAULT_LOOP_BUDGET,
} from '../../../routes/chat/services/agenticLoop/types.js';
import { type Deadline } from '../../../utils/deadline.js';
import { LANDTAGE, type ResolvedLandtagFilter, resolveFilters } from '../registry.js';

import { dedupeByRef, personFraktion, personNames, toCandidate } from './documents.js';
import { type PardokLister, type PardokParams } from './pardokLive.js';

/** Höchstens so viele Kandidaten gehen an das Modell. */
export const MAX_CANDIDATES = 25;
/** Soviele Einzelabfragen ersetzen eine ODER-Liste (Typ × Fraktion). */
const MAX_OR_QUERIES = 8;
/** Soviele Titelbegriffe werden gesucht (ODER). */
const MAX_TITLE_TERMS = 4;
/** Unter dieser Trefferzahl lohnt der Volltext-Rückfall. */
const MIN_CANDIDATES = 3;
/** Lokaler Fraktionsabgleich bei Anfragen: so viele neueste Treffer werden geprüft. */
const ANFRAGE_SCAN_PAGES = 2;
const SCAN_PAGE_SIZE = 200;

/**
 * Volltext startet nur, wenn von der Frist des Aufrufs noch so viel übrig ist: ein Themenwort
 * braucht ~4 s, ein Name ~36 s (live 09.11.2026); darunter wäre der Versuch aussichtslos
 * und kostete nur die Frist.
 */
export const MIN_VOLLTEXT_MS = 10_000;

export interface LandtagFindResult {
  candidates: BundestagCandidate[];
  /** Summe der Trefferzahlen aller Abfragen; kann Dokumente mehrerer Urheber doppelt zählen. */
  gesamt: number;
  notes: string[];
  /** Gesetzt, wenn die Anfrage hier nichts finden KANN (Lizenz, Fraktion nicht vertreten): eine Antwort, kein Fehlschlag. */
  ausgeschlossen?: string;
}

function baseParams(f: ResolvedLandtagFilter): PardokParams {
  const params: PardokParams = {};
  if (f.wahlperiode != null) params['f.wahlperiode'] = f.wahlperiode;
  if (f.datumVon) params['f.datum.start'] = f.datumVon;
  if (f.datumBis) params['f.datum.end'] = f.datumBis;
  return params;
}

function longest(words: readonly string[]): string | null {
  return [...words].sort((a, b) => b.length - a.length)[0] ?? null;
}

/** „Antje Kapek“ → „Kapek, Antje“; „Kapek, Antje“ bleibt; ein einzelnes Wort ist ein Nachname (`null`). */
function pardokPersonName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name.includes(',')) return name.replace(/\s*,\s*/, ', ');
  const words = name.split(' ');
  if (words.length < 2) return null;
  return `${words.at(-1)}, ${words.slice(0, -1).join(' ')}`;
}

/**
 * Schriftliche Anfragen einer Person. PARDOK filtert den Fragesteller serverseitig, wenn
 * `f.urheber` genau „Nachname, Vorname“ trägt (ohne Groß-/Kleinschreibung; ein Nachname allein,
 * „Kapek*“ oder „Vorname Nachname“ liefern 0). Gemeinsam gestellte Anfragen zählen mit. Die
 * Zahl ist damit vollständig, keine Stichprobe: anders als der Volltext, der Anfragen nur
 * zählt, die den Namen irgendwo erwähnen (live: 25 „Anfragen“ waren die Seitenlänge, #5573).
 * Ein bloßer Nachname wird an den neuesten Anfragen zum vollen Namen aufgelöst.
 */
async function findPerson(
  f: ResolvedLandtagFilter,
  person: string,
  topicTerms: readonly string[],
  pardok: PardokLister,
  signal: AbortSignal | null,
  notes: string[]
): Promise<LandtagFindResult> {
  const anfrageTypen = [...(LANDTAGE.berlin.typen.Anfrage ?? [])];
  let name = pardokPersonName(person);
  if (!name) {
    const surname = person.trim().toLowerCase();
    const found = new Set<string>();
    let cursor: string | null = null;
    let checked = 0;
    for (let p = 0; p < ANFRAGE_SCAN_PAGES; p++) {
      const pg = await pardok.list(
        'drucksache',
        {
          ...baseParams(f),
          'f.drucksachtyp': anfrageTypen[0] ?? 'Schriftliche Anfrage',
          limit: SCAN_PAGE_SIZE,
          ...(cursor ? { cursor } : {}),
        },
        signal
      );
      checked += pg.documents.length;
      for (const r of pg.documents) {
        for (const n of personNames(r)) {
          if (n.split(',')[0]!.trim().toLowerCase() === surname) found.add(n);
        }
      }
      cursor = pg.cursor;
      if (!cursor || pg.documents.length === 0) break;
    }
    if (found.size !== 1) {
      notes.push(
        found.size === 0
          ? `Der Nachname „${person}“ kommt in den neuesten ${checked} Schriftlichen Anfragen nicht vor; PARDOK sucht Fragesteller*innen nur mit vollem Namen („Nachname, Vorname“). Mit Vornamen erneut fragen.`
          : `Der Nachname „${person}“ ist nicht eindeutig (${[...found].join('; ')}); mit Vornamen erneut fragen.`
      );
      return { candidates: [], gesamt: 0, notes };
    }
    name = [...found][0]!;
    notes.push(
      `Den Namen „${person}“ habe ich an den neuesten ${checked} Schriftlichen Anfragen zu „${name}“ aufgelöst.`
    );
  }

  const combos: PardokParams[] =
    f.typen.length > 0 ? f.typen.map((t) => ({ 'f.drucksachtyp': t })) : [{}];
  const pages = await Promise.all(
    combos.map((c) =>
      pardok.list(
        'drucksache',
        {
          ...baseParams(f),
          ...c,
          'f.urheber': name,
          ...(topicTerms.length > 0 ? { 'f.titel': [...topicTerms] } : {}),
          limit: MAX_CANDIDATES,
        },
        signal
      )
    )
  );
  const docs: BundestagCandidate[] = [];
  let numFound = 0;
  for (const pg of pages) {
    numFound += pg.numFound;
    for (const r of pg.documents) {
      const c = toCandidate(r);
      if (c) docs.push(c);
    }
  }
  const candidates = dedupeByRef(docs)
    .sort((a, b) => b.datum.localeCompare(a.datum))
    .slice(0, MAX_CANDIDATES);
  if (f.fraktionen.length > 0) {
    notes.push('Die Fraktion wurde bei der Suche nach einer Person nicht zusätzlich angewendet.');
  }
  const zumThema =
    topicTerms.length > 0
      ? ` zum Thema ${topicTerms.map((t) => `„${t}“`).join(' / ')} (Titelsuche: trifft nur Titel, die das Wort enthalten, die Zahl ist eine Untergrenze)`
      : '';
  notes.push(
    numFound > 0
      ? `Laut PARDOK stehen ${numFound} Dokumente${zumThema} (mit den gesetzten Filtern) von „${name}“, auch gemeinsam mit anderen gestellte. Die Zahl ist vollständig, keine Stichprobe.`
      : `Keine Dokumente${zumThema} von „${name}“ gefunden. PARDOK kennt Fragesteller*innen nur in der Schreibweise „Nachname, Vorname“; ein Tippfehler ergibt 0.`
  );
  return { candidates, gesamt: numFound, notes };
}

export async function findBerlin(
  args: { query: string; filters: LandtagFilter; deadline?: Deadline | null },
  pardok: PardokLister
): Promise<LandtagFindResult> {
  const meta = LANDTAGE.berlin;
  const f = resolveFilters(meta, args.filters);
  const notes = [...f.notes];
  if (f.empty) return { candidates: [], gesamt: 0, notes, ausgeschlossen: f.empty };

  const keywords = keywordsFromQuestion(args.query);
  if (f.person) {
    // Das Thema bleibt: Person und Titel in einer Abfrage. Die Wörter des Namens selbst sind kein Thema
    // (das Modell gibt den Namen oft zusätzlich als query).
    const nameWords = new Set(f.person.toLowerCase().match(/[\p{L}\p{N}-]+/gu) ?? []);
    const topicTerms = f.titel
      ? [f.titel]
      : keywords.filter((k) => !nameWords.has(k)).slice(0, MAX_TITLE_TERMS);
    return findPerson(f, f.person, topicTerms, pardok, args.deadline?.signal ?? null, notes);
  }

  const titleTerms = f.titel ? [f.titel] : keywords.slice(0, MAX_TITLE_TERMS);
  const hasCriterion =
    titleTerms.length > 0 ||
    !!f.volltext ||
    f.typen.length > 0 ||
    f.fraktionen.length > 0 ||
    f.wahlperiode != null ||
    !!f.datumVon ||
    !!f.datumBis;
  if (!hasCriterion) {
    return { candidates: [], gesamt: 0, notes: ['Suchbegriff oder Filter fehlt.', ...notes] };
  }

  const anfrageTypen = new Set(meta.typen.Anfrage ?? []);
  const serverTypen = f.typen.filter((t) => !anfrageTypen.has(t));
  const anfrageDabei = f.typen.some((t) => anfrageTypen.has(t));
  const scanAnfragen = anfrageDabei && f.fraktionen.length > 0;

  // ODER-Liste über Einzelabfragen; leere Listen heißen „kein Filter".
  let combos: PardokParams[] = [{}];
  const times = (key: string, values: readonly string[]) => {
    if (values.length === 0) return;
    combos = combos.flatMap((c) => values.map((v) => ({ ...c, [key]: v })));
  };
  // Anfragen mit Fraktion übernimmt der Scan; der Server-Zweig fragt dann nur die übrigen Arten.
  times('f.drucksachtyp', scanAnfragen ? serverTypen : f.typen);
  times('f.urheber', f.fraktionen);
  if (combos.length > MAX_OR_QUERIES) {
    notes.push(
      `Es wurden nur die ersten ${MAX_OR_QUERIES} Kombinationen aus Art und Fraktion abgefragt.`
    );
    combos = combos.slice(0, MAX_OR_QUERIES);
  }
  const skipServer = scanAnfragen && serverTypen.length === 0;

  const signal = args.deadline?.signal ?? null;
  const run = async (extra: PardokParams, scan = false) => {
    const docs: BundestagCandidate[] = [];
    let numFound = 0;
    if (!skipServer) {
      const pages = await Promise.all(
        combos.map((c) =>
          pardok.list(
            'drucksache',
            {
              ...baseParams(f),
              ...c,
              ...extra,
              limit: MAX_CANDIDATES,
            },
            signal
          )
        )
      );
      for (const pg of pages) {
        numFound += pg.numFound;
        for (const r of pg.documents) {
          const c = toCandidate(r);
          if (c) docs.push(c);
        }
      }
    }
    if (scan) {
      const want = new Set(f.fraktionen.map((x) => x.toLowerCase()));
      let cursor: string | null = null;
      let checked = 0;
      let total = 0;
      for (let p = 0; p < ANFRAGE_SCAN_PAGES; p++) {
        const pg = await pardok.list(
          'drucksache',
          {
            ...baseParams(f),
            ...extra,
            'f.drucksachtyp': [...anfrageTypen][0] ?? 'Schriftliche Anfrage',
            limit: SCAN_PAGE_SIZE,
            ...(cursor ? { cursor } : {}),
          },
          signal
        );
        total = pg.numFound;
        checked += pg.documents.length;
        for (const r of pg.documents) {
          if (!personFraktion(r).some((x) => want.has(x.toLowerCase()))) continue;
          const c = toCandidate(r);
          if (c) docs.push(c);
        }
        cursor = pg.cursor;
        if (!cursor || pg.documents.length === 0) break;
      }
      numFound += docs.length;
      if (checked < total) {
        notes.push(
          `Schriftliche Anfragen tragen die Fraktion an der fragenden Person; PARDOK filtert sie nicht. Geprüft wurden die neuesten ${checked} von ${total} Anfragen, ältere fehlen möglicherweise.`
        );
      }
    }
    return { docs, numFound };
  };

  // Themenwörter: Titel-ODER; ein ausdrücklicher Volltext-Begriff geht für sich.
  const topic: PardokParams = {};
  if (titleTerms.length > 0 && !f.volltext) topic['f.titel'] = titleTerms;
  else if (f.titel) topic['f.titel'] = [f.titel];
  if (f.volltext) topic['f.volltext'] = f.volltext;

  // Volltext läuft unter der Frist des ganzen Aufrufs (`args.deadline`), nicht unter einem
  // eigenen Anteil: PARDOK braucht für einen Namen ~36 s, auch mit Zeitraum. `null` heißt
  // „zu wenig Zeit zum Starten" oder „Frist abgelaufen" (die Abfrage ist dann abgebrochen).
  const volltext = async (extra: PardokParams) => {
    const { deadline } = args;
    if (!deadline) return run(extra, scanAnfragen);
    if (deadline.remainingMs() < MIN_VOLLTEXT_MS) return null;
    const work = run(extra, scanAnfragen);
    work.catch(() => null);
    return Promise.race([
      work,
      new Promise<null>((resolve) => {
        if (deadline.signal.aborted) resolve(null);
        else deadline.signal.addEventListener('abort', () => resolve(null), { once: true });
      }),
    ]);
  };

  let docs: BundestagCandidate[] = [];
  let numFound = 0;
  if (f.volltext) {
    // Die schnelle Titelsuche läuft daneben: bleibt der Volltext aus, ist sie das Teilergebnis.
    const titelTopic: PardokParams = f.titel
      ? { 'f.titel': [f.titel] }
      : titleTerms.length > 0
        ? { 'f.titel': titleTerms }
        : {};
    const hasTitel = Object.keys(titelTopic).length > 0;
    const [first, titel] = await Promise.all([
      volltext(topic),
      hasTitel ? run(titelTopic, scanAnfragen).catch(() => null) : Promise.resolve(null),
    ]);
    if (first) ({ docs, numFound } = first);
    else {
      if (titel) ({ docs, numFound } = titel);
      notes.push(
        `Die Volltextsuche nach „${f.volltext}“ dauerte zu lange oder fand keine Zeit mehr und wurde abgebrochen${titel ? '; es folgt nur die Titelsuche' : ''}. Volltext ist bei häufigen Wörtern und Namen nicht in der Frist zu haben; ein Themenwort im Titel (\`titel\`) suchen.`
      );
    }
  } else {
    ({ docs, numFound } = await run(topic, scanAnfragen));
  }

  const fallback = !f.volltext && !f.titel ? longest(keywords) : null;
  if (dedupeByRef(docs).length < MIN_CANDIDATES && fallback) {
    const more = await volltext({ 'f.volltext': fallback });
    if (more) {
      docs = [...docs, ...more.docs];
      numFound = Math.max(numFound, more.numFound);
      notes.push(
        `Zu wenige Titeltreffer; zusätzlich im Volltext nach „${fallback}“ gesucht. Volltexttreffer erwähnen den Begriff nur irgendwo im Dokument; sie stammen nicht zwingend von der Person oder Stelle, die so heißt.`
      );
    } else {
      notes.push(
        `Zu wenige Titeltreffer; die Volltextsuche nach „${fallback}“ dauert zu lange und wurde übersprungen. Es folgen nur die Titeltreffer; für einen Namen gibt es keinen schnellen Weg, ein Themenwort im Titel (\`titel\`) lässt sich suchen.`
      );
    }
  }

  const candidates = dedupeByRef(docs)
    .sort((a, b) => b.datum.localeCompare(a.datum))
    .slice(0, MAX_CANDIDATES);

  if (!anfrageDabei && f.fraktionen.length > 0 && f.typen.length === 0) {
    notes.push(
      'Schriftliche Anfragen einzelner Abgeordneter tragen keine Fraktion in der Dokumentation und fehlen bei einem Fraktionsfilter ohne Art; sie mit `typ: Anfrage` gezielt suchen.'
    );
  }
  if (
    candidates.length === 0 &&
    Object.keys(topic).length > 0 &&
    !scanAnfragen &&
    !signal?.aborted
  ) {
    // Null Treffer sagen allein nicht, ob das Thema fehlt oder der Filter: ohne Themenwort zählen.
    const counts = await Promise.all(
      combos.map((c) => pardok.list('drucksache', { ...baseParams(f), ...c, limit: 1 }, signal))
    );
    const ohneThema = counts.reduce((n, pg) => n + pg.numFound, 0);
    if (ohneThema > 0) {
      notes.push(
        `Keine Treffer zum Thema. Allein mit den Filtern gibt es etwa ${ohneThema} Dokumente; ein anderes Themenwort im Titel oder weniger Filter probieren.`
      );
    }
  }
  if (numFound > candidates.length) {
    notes.push(
      `Gezeigt werden die neuesten ${candidates.length} von etwa ${numFound} Treffern; mit Zeitraum, Titel oder Art eingrenzen.`
    );
  }
  return { candidates, gesamt: numFound, notes };
}
