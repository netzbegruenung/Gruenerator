/**
 * Stufe „fetch" des Bundestag-Q&A: aus Refs werden Kandidaten, aus Kandidaten
 * Volltexte.
 *
 * Drucksachen kommen aus `drucksache-text` (Volltext in der Liste, 10 je Seite);
 * ist der Text dort leer (frische Dokumente), liest `extractPdfText` das PDF.
 * Debatten kommen aus dem Plenarprotokoll-XML, zugeschnitten auf die Redner,
 * deren Rede in der Seitenspanne beginnt. Fremde URLs nur auf
 * dserver.bundestag.de über https und erst nach `validateUrlForFetch`.
 */
import { type BundestagCandidate, type BundestagTextSource } from '@gruenerator/contracts';
import * as cheerio from 'cheerio';

import { createLogger } from '../../../utils/logger.js';
import { validateUrlForFetch } from '../../../utils/validation/urlSecurity.js';
import { extractPdfText } from '../../pdf/pdfText.js';
import { type DipClient, type DipDrucksache, type DipDrucksacheText } from '../dip/dipClient.js';

import {
  PDF_FALLBACK_CONCURRENCY,
  PDF_MAX_BYTES,
  TEXT_CACHE_TTL_S,
  createLimiter,
} from './budget.js';

const log = createLogger('BundestagQaFetch');

const ALLOWED_HOST = 'dserver.bundestag.de';
/** DIP liefert 10 Dokumente je Seite; mehr Nummern pro `f.dokumentnummer`-Abfrage lohnen nicht. */
const DIP_PAGE_SIZE = 10;
const FETCH_TIMEOUT_MS = 60_000;
const DEBATE_REF_RE = /^PlPr (\d{1,2})\/(\d{1,4}) S\. (\d+)-(\d+)$/;

export type TextSource = BundestagTextSource;
/** Warum ein Text fehlt, wenn es mehr zu sagen gibt als „kein Volltext"; nur bei `'missing'`. */
export interface Fehlgrund {
  art: 'seitenbereich' | 'unveroeffentlicht' | 'abruf';
  text: string;
}
export type FetchedDoc = BundestagCandidate & {
  text: string;
  textSource: TextSource;
  fehlgrund?: Fehlgrund;
};

/** Das Minimum, das wir vom Redis-Client brauchen; Tests reichen eine Map-Attrappe herein. */
export interface TextCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options: { EX: number }): Promise<unknown>;
}

type DipLister = Pick<DipClient, 'list'>;

// ---------------------------------------------------------------------------
// Ref-Auflösung
// ---------------------------------------------------------------------------

function toCandidate(doc: DipDrucksache): BundestagCandidate {
  const vorgang = doc.vorgangsbezug?.[0] ?? null;
  return {
    ref: doc.dokumentnummer,
    dipId: doc.id,
    kind: 'drucksache',
    dokumentnummer: doc.dokumentnummer,
    drucksachetyp: doc.drucksachetyp ?? '',
    titel: doc.titel ?? '',
    datum: doc.datum ?? '',
    urheber: (doc.urheber ?? []).map((u) => u.titel).filter((t): t is string => !!t),
    pdfUrl: doc.fundstelle?.pdf_url ?? null,
    vorgangId: vorgang?.id ?? null,
    vorgangTitel: vorgang?.titel ?? null,
    abstract: null,
    aktualisiert: doc.aktualisiert ?? null,
    beratung: null,
  };
}

/** btp/{wp}/{wp}{nr, dreistellig}.xml — am Protokoll 21/80 geprüft. */
function debateCandidate(ref: string, m: RegExpMatchArray): BundestagCandidate {
  const [, wp, nr, anfang, ende] = m;
  return {
    ref,
    dipId: `plpr:${wp}/${nr}`,
    kind: 'beratung',
    dokumentnummer: `${wp}/${nr}`,
    drucksachetyp: 'Plenarprotokoll',
    titel: `Plenarprotokoll ${wp}/${nr}`,
    datum: '',
    urheber: [],
    pdfUrl: null,
    vorgangId: null,
    vorgangTitel: null,
    abstract: null,
    aktualisiert: null,
    beratung: {
      xmlUrl: `https://${ALLOWED_HOST}/btp/${wp}/${wp}${nr.padStart(3, '0')}.xml`,
      anfangsseite: Number(anfang),
      endseite: Number(ende),
    },
  };
}

/** Unbekannte Drucksachen fallen still weg: der Aufrufer sieht an der Länge, was fehlt. */
export async function resolveRefs(
  refs: readonly string[],
  dip: DipLister
): Promise<BundestagCandidate[]> {
  const byRef = new Map<string, BundestagCandidate>();
  const drucksachen: string[] = [];

  for (const ref of new Set(refs)) {
    const m = DEBATE_REF_RE.exec(ref);
    if (m) byRef.set(ref, debateCandidate(ref, m));
    else drucksachen.push(ref);
  }

  // Leeres Array hieße bei DIP „kein Filter" = alles; darum nie ohne Nummern fragen.
  for (let i = 0; i < drucksachen.length; i += DIP_PAGE_SIZE) {
    const chunk = drucksachen.slice(i, i + DIP_PAGE_SIZE);
    const page = await dip.list<DipDrucksache>('drucksache', {
      'f.dokumentnummer': chunk,
      'f.zuordnung': 'BT',
    });
    for (const doc of page.documents) {
      if (chunk.includes(doc.dokumentnummer)) byRef.set(doc.dokumentnummer, toCandidate(doc));
    }
  }

  return [...new Set(refs)].flatMap((ref) => byRef.get(ref) ?? []);
}

// ---------------------------------------------------------------------------
// Abruf fremder Dateien
// ---------------------------------------------------------------------------

/** Wirft, wenn die URL nicht https://dserver.bundestag.de ist oder die Validierung scheitert. */
async function safeUrl(raw: string, allowedHost: string = ALLOWED_HOST): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('ungültige URL');
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== allowedHost) {
    throw new Error(`Host nicht erlaubt: ${parsed.hostname}`);
  }
  const checked = await validateUrlForFetch(parsed.toString());
  if (!checked.isValid || !checked.url) throw new Error(checked.error ?? 'URL abgelehnt');
  return checked.url;
}

/**
 * Lädt höchstens `PDF_MAX_BYTES`: erst der Header, dann der Strom mit eigenem Zähler.
 * `allowedHost` ist der eine Host, den die Quelle ausliefert — die Landtage nutzen
 * dieselbe Sperre mit ihrem eigenen (`services/landtag/`).
 */
export async function fetchBytes(
  raw: string,
  signal: AbortSignal,
  allowedHost: string = ALLOWED_HOST
): Promise<Uint8Array> {
  const url = await safeUrl(raw, allowedHost);
  const res = await fetch(url, {
    redirect: 'error',
    signal: AbortSignal.any([signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)]),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > PDF_MAX_BYTES) throw new Error(`Datei zu groß (${declared} Bytes)`);
  if (!res.body) throw new Error('Antwort ohne Inhalt');

  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    total += chunk.byteLength;
    if (total > PDF_MAX_BYTES) throw new Error('Datei zu groß (Strom)');
    chunks.push(chunk);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Debatten: Plenarprotokoll-XML
// ---------------------------------------------------------------------------

/**
 * Die Seitenmarken im Redetext fehlen im XML; die Startseite jeder Rede steht
 * nur im Inhaltsverzeichnis (`<xref ref-type="rede" rid pnr>`), am Protokoll
 * 21/80 für alle 154 Reden geprüft.
 *
 * Eine Rede enthält auch Zwischenrufe der Sitzungsleitung (`<name>` als
 * Kind, danach eigene Absätze bis zum nächsten `p.redner`); die gehören nicht
 * zur Rede und werden übersprungen. `<kommentar>` fällt weg.
 */
export function parseDebate(
  xml: string,
  anfangsseite: number,
  endseite: number
): { text: string; seiten: { von: number; bis: number } | null } {
  const $ = cheerio.load(xml, { xmlMode: true });

  const startPage = new Map<string, number>();
  $('xref[ref-type="rede"]').each((_, el) => {
    const rid = $(el).attr('rid');
    const pnr = Number($(el).attr('pnr'));
    if (rid && Number.isFinite(pnr)) startPage.set(rid, pnr);
  });

  const blocks: string[] = [];
  $('rede').each((_, rede) => {
    const page = startPage.get($(rede).attr('id') ?? '');
    if (page === undefined || page < anfangsseite || page > endseite) return;

    const lines: string[] = [];
    let speaker = '';
    let muted = false;
    $(rede)
      .children()
      .each((__, child) => {
        if (child.type !== 'tag') return;
        if (child.name === 'name') {
          muted = true;
        } else if (child.name === 'p' && $(child).attr('klasse') === 'redner') {
          const name = $(child).find('redner > name').first();
          const vorname = name.children('vorname').text().trim();
          const nachname = name.children('nachname').text().trim();
          const zusatz =
            name.children('fraktion').text().trim() ||
            name.find('rolle_lang').first().text().trim();
          const label = `${vorname} ${nachname}`.trim() + (zusatz ? ` (${zusatz})` : '');
          muted = false;
          if (label && label !== speaker) {
            speaker = label;
            lines.push(`### ${label}`);
          }
        } else if (child.name === 'p' && !muted) {
          const text = $(child).text().replace(/\s+/g, ' ').trim();
          if (text) lines.push(text);
        }
      });
    if (lines.length > 0) blocks.push(lines.join('\n\n'));
  });

  // Die Spanne aller Redeanfänge, damit ein leerer Schnitt sagen kann, wo die Reden liegen.
  const pages = [...startPage.values()];
  return {
    text: blocks.join('\n\n'),
    seiten: pages.length > 0 ? { von: Math.min(...pages), bis: Math.max(...pages) } : null,
  };
}

// ---------------------------------------------------------------------------
// fetchTexts
// ---------------------------------------------------------------------------

export interface FetchTextsDeps {
  dip: DipLister;
  redis: TextCache | null;
  signal: AbortSignal;
}

export interface CachedText {
  text: string;
  textSource: TextSource;
  /** Nur bei leerem Text; wird nie gecacht. */
  fehlgrund?: Fehlgrund;
}

export async function readCache(redis: TextCache | null, key: string): Promise<CachedText | null> {
  if (!redis) return null;
  try {
    const raw = await redis.get(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedText>;
    return typeof parsed.text === 'string' && parsed.text && parsed.textSource
      ? { text: parsed.text, textSource: parsed.textSource }
      : null;
  } catch (error: unknown) {
    log.warn(`Cache-Lesen fehlgeschlagen (${key}): ${String(error)}`);
    return null;
  }
}

/** Leere Texte werden nicht gecacht: ein später gefüllter DIP-Text soll nicht eine Woche lang fehlen. */
export async function writeCache(
  redis: TextCache | null,
  key: string,
  value: CachedText
): Promise<void> {
  if (!redis || !value.text) return;
  try {
    await redis.set(key, JSON.stringify(value), { EX: TEXT_CACHE_TTL_S });
  } catch (error: unknown) {
    log.warn(`Cache-Schreiben fehlgeschlagen (${key}): ${String(error)}`);
  }
}

/** Alle Texte zu `ids`; blättert bis zum Ende oder bis alle da sind. */
async function fetchDipTexts(
  ids: readonly string[],
  dip: DipLister
): Promise<Map<string, DipDrucksacheText>> {
  const found = new Map<string, DipDrucksacheText>();
  if (ids.length === 0) return found;

  let cursor: string | null = null;
  for (;;) {
    const page: Awaited<ReturnType<DipLister['list']>> = await dip.list<DipDrucksacheText>(
      'drucksache-text',
      { 'f.id': ids, ...(cursor ? { cursor } : {}) }
    );
    for (const doc of page.documents as DipDrucksacheText[]) found.set(doc.id, doc);
    if (found.size >= ids.length || page.documents.length === 0) break;
    if (!page.cursor || page.cursor === cursor) break;
    cursor = page.cursor;
  }
  return found;
}

async function pdfFallback(url: string | null, signal: AbortSignal): Promise<string> {
  if (!url) return '';
  try {
    return (await extractPdfText(await fetchBytes(url, signal))).trim();
  } catch (error: unknown) {
    log.warn(`PDF-Rückfall fehlgeschlagen (${url}): ${String(error)}`);
    return '';
  }
}

async function fetchDebate(
  candidate: BundestagCandidate,
  { redis, signal }: FetchTextsDeps
): Promise<CachedText> {
  const beratung = candidate.beratung;
  if (!beratung) return { text: '', textSource: 'missing' };

  const key = `bt:qa:debatte:v1:${beratung.xmlUrl}:${beratung.anfangsseite}-${beratung.endseite}`;
  const cached = await readCache(redis, key);
  if (cached) return cached;

  const label = `Plenarprotokoll ${candidate.dokumentnummer}`;
  let bytes: Uint8Array;
  try {
    bytes = await fetchBytes(beratung.xmlUrl, signal);
  } catch (error: unknown) {
    log.warn(`Protokoll nicht lesbar (${beratung.xmlUrl}): ${String(error)}`);
    const notFound = error instanceof Error && error.message === 'HTTP 404';
    return {
      text: '',
      textSource: 'missing',
      fehlgrund: notFound
        ? {
            art: 'unveroeffentlicht',
            text: `${label} ist beim Bundestag noch nicht als XML veröffentlicht`,
          }
        : { art: 'abruf', text: `${label} war nicht abrufbar (${String(error)})` },
    };
  }
  const { text, seiten } = parseDebate(
    new TextDecoder('utf-8').decode(bytes),
    beratung.anfangsseite,
    beratung.endseite
  );
  if (!text) {
    // Gemessen 29.10.2026: das Modell bildete „PlPr 21/96 S. 1-200" selbst, die
    // Reden dort beginnen ab S. 11785 — der Schnitt war leer, gemeldet wurde
    // „kein Volltext", und das Modell konnte daraus nichts lernen.
    return {
      text: '',
      textSource: 'missing',
      fehlgrund: {
        art: 'seitenbereich',
        text: seiten
          ? `In ${label} beginnt keine Rede auf S. ${beratung.anfangsseite}–${beratung.endseite}; die Reden beginnen dort auf S. ${seiten.von}–${seiten.bis}`
          : `${label} enthält keine Reden`,
      },
    };
  }
  const value: CachedText = { text, textSource: 'protokoll' };
  await writeCache(redis, key, value);
  return value;
}

/** Ergebnis in der Reihenfolge der Kandidaten; was nicht zu holen war, trägt `'missing'`. */
export async function fetchTexts(
  candidates: readonly BundestagCandidate[],
  deps: FetchTextsDeps
): Promise<FetchedDoc[]> {
  const { dip, redis, signal } = deps;
  // Schlüssel ist der Kandidat selbst: zwei Debatten desselben Protokolls teilen die dipId.
  const results = new Map<BundestagCandidate, CachedText>();
  const cacheKey = (c: BundestagCandidate) => `bt:qa:text:v1:${c.dipId}:${c.aktualisiert ?? ''}`;

  const drucksachen = candidates.filter((c) => c.kind === 'drucksache');
  const toLoad: BundestagCandidate[] = [];
  for (const c of drucksachen) {
    const hit = await readCache(redis, cacheKey(c));
    if (hit) results.set(c, hit);
    else toLoad.push(c);
  }

  const fromDip = await fetchDipTexts(
    toLoad.map((c) => c.dipId),
    dip
  );
  const limitPdf = createLimiter(PDF_FALLBACK_CONCURRENCY);
  await Promise.all(
    toLoad.map(async (c) => {
      const doc = fromDip.get(c.dipId);
      const dipText = doc?.text?.trim() ?? '';
      let value: CachedText;
      if (dipText) {
        value = { text: dipText, textSource: 'dip' };
      } else {
        const pdfText = await limitPdf(() =>
          pdfFallback(c.pdfUrl ?? doc?.fundstelle?.pdf_url ?? null, signal)
        );
        value = pdfText
          ? { text: pdfText, textSource: 'pdf' }
          : { text: '', textSource: 'missing' };
      }
      await writeCache(redis, cacheKey(c), value);
      results.set(c, value);
    })
  );

  await Promise.all(
    candidates
      .filter((c) => c.kind === 'beratung')
      .map(async (c) => results.set(c, await fetchDebate(c, deps)))
  );

  return candidates.map((c) => ({
    ...c,
    ...(results.get(c) ?? { text: '', textSource: 'missing' as const }),
  }));
}
