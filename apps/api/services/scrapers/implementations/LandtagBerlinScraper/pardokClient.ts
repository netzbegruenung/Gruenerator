/**
 * Lesezugriff auf die API der Parlamentsdokumentation des Abgeordnetenhauses
 * (PARDOK, https://pardok.parlament-berlin.de/api/v1, OpenAPI unter
 * `/api/v1/openapi.json`). Die Antworten tragen jedes Feld als Liste von
 * Objekten (`[{ main: "…" }]`); `toEntry` macht daraus einen flachen Eintrag.
 *
 * Zwei Eigenheiten, beide am 04.10.2026 gemessen:
 *   - Der Cursor meldet das Ende nicht: nach dem letzten Treffer beginnt die
 *     Liste von vorn. Das Ende ist erreicht, wenn eine Seite nichts Neues
 *     bringt oder `numFound` erreicht ist.
 *   - Einträge ohne Datum (angekündigte Beratungen ohne Protokoll) machen den
 *     Cursor ungültig — HTTP 400 „Invalid cursor". `f.datum.start` hält sie
 *     heraus; ihnen fehlt ohnehin das PDF. Auch danach kann ein Cursor mitten
 *     im Lauf ungültig werden; `list` setzt dann neu an.
 *
 * Der mitgelieferte Volltext (`f.volltext_anzeigen`) bleibt ungenutzt: er hat
 * keine Zeilenumbrüche und keine Seiten, und bei manchen Dateien steht dort
 * eine Fehlermeldung des Konverters. Der Text kommt aus dem PDF.
 */

import { BRAND } from '../../../../utils/domainUtils.js';
import { HttpStatusError } from '../../base/BaseScraper.js';
import { type Fetcher, type PoliteGate } from '../../parliament/index.js';

export const PARDOK_API = 'https://pardok.parlament-berlin.de/api/v1';
const PAGE_SIZE = 200;
const LIST_TIMEOUT_MS = 60_000;
/** Vor diesem Tag liegt keine Wahlperiode, die wir führen — der Filter ist für den Cursor da. */
const DATUM_FLOOR = '2020-01-01';
/** So oft darf ein ungültiger Cursor den Lauf neu ansetzen lassen. */
const MAX_CURSOR_RESTARTS = 5;

export const PARDOK_ENDPOINTS = {
  drucksache: 'drucksache',
  plenarprotokoll: 'plenarprotokoll',
  ausschussprotokoll: 'ausschussprotokolle',
} as const;

export type PardokPart = keyof typeof PARDOK_ENDPOINTS;

type Field = Record<string, string>;
export type PardokRecord = Record<string, Field[] | string | undefined>;

export interface PardokEntry {
  /** „D-459707" */
  id: string;
  documentNumber: string;
  docType: string;
  title: string;
  /** Sachgebiet der Dokumentation, z. B. „Städtebau". */
  sachgebiet: string | null;
  /** ISO-Datum, `null` wenn PARDOK keins hat. */
  publishedAt: string | null;
  /** Letzte Änderung in PARDOK, ISO-Datum. */
  updatedAt: string | null;
  pdfUrls: { url: string; label: string | null }[];
  /** Roh aus `dseit`: „9400"–„9406" oder eine Liste „9305, 9230, 9231". */
  pages: { from: string; to: string | null } | null;
  /** Personen mit ihrer Fraktion bzw. ihrem Amt. */
  urheber: { name: string; fraktion: string }[];
  /** Fraktionen, Ausschüsse, Senatsverwaltungen. */
  koerperschaften: string[];
}

const first = (r: PardokRecord, key: string): Field | undefined => {
  const v = r[key];
  return Array.isArray(v) ? v[0] : undefined;
};

const list = (r: PardokRecord, key: string): Field[] => {
  const v = r[key];
  return Array.isArray(v) ? v : [];
};

/** „2026.09.29" → „2026-09-29" */
export function isoDate(datum: string | undefined): string | null {
  const m = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(datum ?? '');
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export function toEntry(r: PardokRecord): PardokEntry {
  const titel = first(r, 'titel');
  const dseit = first(r, 'dseit');
  return {
    id: first(r, 'id')?.main ?? '',
    documentNumber: first(r, 'dokumentnummer')?.main ?? '',
    docType: first(r, 'drucksachentyp')?.main ?? '',
    title: (titel?.t || titel?.main || '').trim(),
    sachgebiet: titel?.d?.trim() || null,
    publishedAt: isoDate(typeof r.datum === 'string' ? r.datum : undefined),
    updatedAt: isoDate(first(r, 'aktualisiert')?.D?.replace(/ /g, '.')),
    pdfUrls: list(r, 'pdf_url').map((p) => ({ url: p.main, label: p.t ?? null })),
    pages: dseit?.anfangsseite ? { from: dseit.anfangsseite, to: dseit.endseite ?? null } : null,
    urheber: list(r, 'urheber').map((u) => ({ name: u.name ?? '', fraktion: u.fraktion ?? '' })),
    koerperschaften: list(r, 'urheber_koerperschaft')
      .map((k) => k.main)
      .filter(Boolean),
  };
}

export class PardokClient {
  constructor(
    private readonly gate: PoliteGate,
    private readonly fetcher: Fetcher,
    /**
     * `PARDOK_API_KEY`. Die Open-Data-Seite
     * (https://pardok.parlament-berlin.de/portala/opendata.tt.html) nennt einen
     * öffentlichen Schlüssel, „zunächst bis Ende Dezember 2026 gültig"; einen
     * eigenen mit zehn Jahren Laufzeit gibt es per Mail an
     * opendata@parlament-berlin.de.
     */
    private readonly apiKey: string
  ) {}

  /**
   * Alle Einträge einer Art zu den Filtern, Seite für Seite an `onPage`.
   * Liefert die Zahl der abgerufenen Seiten.
   *
   * Die Liste steht neueste zuerst. Wird ein Cursor mitten im Lauf ungültig
   * (HTTP 400 „Invalid cursor"), geht es ab dem ältesten schon gesehenen Datum
   * ohne Cursor weiter; was doppelt kommt, fällt über die Id heraus.
   */
  async list(
    part: PardokPart,
    filters: Record<string, string>,
    onPage: (entries: PardokEntry[]) => Promise<void> | void
  ): Promise<number> {
    const seen = new Set<string>();
    let window: Record<string, string> = {};
    let cursor: string | null = null;
    let returnedInWindow = 0;
    let oldest: string | null = null;
    let restarts = 0;
    let pages = 0;
    for (;;) {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        'f.datum.start': DATUM_FLOOR,
        ...filters,
        ...window,
      });
      if (cursor) params.set('cursor', cursor);
      let body: { numFound?: number; cursor?: string; documents?: PardokRecord[] };
      try {
        body = await this.gate.run(async () => {
          const res = await this.fetcher(`${PARDOK_API}/${PARDOK_ENDPOINTS[part]}?${params}`, {
            timeout: LIST_TIMEOUT_MS,
            userAgent: BRAND.botUserAgent,
            headers: { Accept: 'application/json', 'X-API-Key': this.apiKey },
          });
          return (await res.json()) as typeof body;
        });
      } catch (error: unknown) {
        const invalidCursor = error instanceof HttpStatusError && error.status === 400 && cursor;
        if (!invalidCursor || !oldest || restarts >= MAX_CURSOR_RESTARTS) throw error;
        restarts += 1;
        window = { 'f.datum.end': oldest };
        cursor = null;
        returnedInWindow = 0;
        continue;
      }
      pages += 1;
      const page = (body.documents ?? []).map(toEntry).filter((e) => e.id);
      returnedInWindow += page.length;
      const fresh = page.filter((e) => !seen.has(e.id));
      for (const e of fresh) {
        seen.add(e.id);
        if (e.publishedAt && (!oldest || e.publishedAt < oldest)) oldest = e.publishedAt;
      }
      if (fresh.length > 0) await onPage(fresh);
      if (fresh.length === 0 || returnedInWindow >= (body.numFound ?? 0) || !body.cursor) {
        return pages;
      }
      if (body.cursor === cursor) return pages;
      cursor = body.cursor;
    }
  }
}
