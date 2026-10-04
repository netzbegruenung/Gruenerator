/**
 * Schlanker Client für die DIP-API des Bundestags (search.dip.bundestag.de).
 *
 * Nur die zwei Volltext-Listen, die der Scraper braucht. Die `-text`-Endpunkte
 * liefern den Volltext direkt in der Liste, ein zweiter Abruf je Dokument
 * entfällt. Geblättert wird per `cursor`: DIP gibt so lange einen neuen Cursor
 * zurück, bis die Liste erschöpft ist — das Ende erkennt man daran, dass der
 * Cursor sich nicht mehr ändert.
 */
import { createLogger } from '../../../../utils/logger.js';

const log = createLogger('DipClient');

const BASE_URL = 'https://search.dip.bundestag.de/api/v1';
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 4;
const PACING_MS = 500;
const RATE_LIMIT_COOLDOWN_MS = 30_000;

export interface DipFundstelle {
  pdf_url?: string;
  datum?: string;
}

export interface DipPlenarprotokollText {
  id: string;
  dokumentnummer: string;
  wahlperiode?: number;
  herausgeber?: string;
  datum?: string;
  titel?: string;
  aktualisiert?: string;
  fundstelle?: DipFundstelle;
  text?: string;
}

export interface DipUrheber {
  titel?: string;
  einbringer?: boolean;
}

export interface DipDrucksacheText {
  id: string;
  dokumentnummer: string;
  drucksachetyp?: string;
  wahlperiode?: number;
  herausgeber?: string;
  datum?: string;
  titel?: string;
  aktualisiert?: string;
  urheber?: DipUrheber[];
  fundstelle?: DipFundstelle;
  text?: string;
}

interface DipPage<T> {
  numFound?: number;
  cursor?: string;
  documents?: T[];
}

export type DipParams = Record<string, string | number>;

export class DipClient {
  #lastRequestAt = 0;

  constructor(private readonly apiKey: string) {}

  /** Alle Seiten einer Liste; `onPage` verarbeitet jede Seite, bevor die nächste kommt. */
  async forEachPage<T>(
    endpoint: 'plenarprotokoll-text' | 'drucksache-text',
    params: DipParams,
    onPage: (documents: T[]) => Promise<void>
  ): Promise<void> {
    let cursor: string | null = null;
    for (;;) {
      const page: DipPage<T> = await this.#get<T>(endpoint, {
        ...params,
        ...(cursor ? { cursor } : {}),
      });
      const documents = page.documents ?? [];
      if (documents.length > 0) await onPage(documents);
      if (!page.cursor || page.cursor === cursor || documents.length === 0) return;
      cursor = page.cursor;
    }
  }

  async #get<T>(endpoint: string, params: DipParams): Promise<DipPage<T>> {
    const url = new URL(`${BASE_URL}/${endpoint}`);
    url.searchParams.set('apikey', this.apiKey);
    url.searchParams.set('format', 'json');
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));

    for (let attempt = 1; ; attempt++) {
      const wait = this.#lastRequestAt + PACING_MS - Date.now();
      if (wait > 0) await sleep(wait);
      this.#lastRequestAt = Date.now();

      let res: Response;
      try {
        res = await fetch(url, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (error: unknown) {
        if (attempt >= MAX_ATTEMPTS) throw error;
        await sleep(2000 * attempt);
        continue;
      }

      if (res.status === 429) {
        if (attempt >= MAX_ATTEMPTS) throw new Error(`DIP rate limit persists on ${endpoint}`);
        log.warn(`[dip] 429 on ${endpoint} — cooling down ${RATE_LIMIT_COOLDOWN_MS}ms`);
        await sleep(RATE_LIMIT_COOLDOWN_MS);
        continue;
      }
      if (res.status >= 500) {
        if (attempt >= MAX_ATTEMPTS) throw new Error(`DIP ${res.status} on ${endpoint}`);
        await sleep(2000 * attempt);
        continue;
      }
      if (!res.ok) throw new Error(`DIP ${res.status} on ${endpoint}`);
      return (await res.json()) as DipPage<T>;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
