/**
 * Lesender Live-Zugriff auf die PARDOK-API des Abgeordnetenhauses für das
 * Chat-Werkzeug `landtag`. Der Scraper (`LandtagBerlinScraper/pardokClient.ts`)
 * läuft über sein eigenes Höflichkeits-Gatter und blättert alles durch; hier
 * wird genau eine Seite je Abfrage geholt, mit Takt, Zeitlimit und Wiederholung
 * wie beim `DipClient`.
 *
 * Gemessen am 28.10.2026: `f.urheber` und `f.drucksachtyp` sind exakt, und
 * wiederholt gesendet gewinnt bei `f.drucksachtyp` der letzte, bei `f.urheber`
 * gilt UND (laut OpenAPI; Grüne 508 und Linke 349 zusammen 170). Mehrere Werte
 * sind nur bei `f.titel`, `f.dokumentnummer`, `f.wahlperiode`, `f.id` ODER.
 * Deshalb baut `find.ts` ODER-Listen über Einzelabfragen. Ein ungültiger
 * Schlüssel wird nach einem Fehlversuch mit 429 gedrosselt — darum wiederholt
 * dieser Client 403 nie.
 */
import { env } from '../../../config/env.js';
import { createLogger } from '../../../utils/logger.js';
import { type PardokRecord } from '../../scrapers/implementations/LandtagBerlinScraper/pardokClient.js';

const log = createLogger('PardokLive');

export const PARDOK_BASE = 'https://pardok.parlament-berlin.de/api/v1';
const DEFAULT_TIMEOUT_MS = 30_000;
/** Die Volltextsuche liegt im Mehrsekundenbereich; das Handbuch verlangt mindestens 60 s. */
const VOLLTEXT_TIMEOUT_MS = 60_000;
const DEFAULT_PACING_MS = 200;
const DEFAULT_MAX_ATTEMPTS = 3;
const MAX_RETRY_AFTER_MS = 30_000;

export type PardokLiveEndpoint = 'drucksache' | 'plenarprotokoll';

/** Ein Array wird als wiederholter Parameter gesendet — nur dort sinnvoll, wo PARDOK ODER meint. */
export type PardokParams = Record<string, string | number | readonly (string | number)[]>;

export interface PardokPage {
  numFound: number;
  cursor: string | null;
  documents: PardokRecord[];
}

export interface PardokLiveOptions {
  timeoutMs?: number;
  maxAttempts?: number;
  pacingMs?: number;
}

export interface PardokLister {
  list(endpoint: PardokLiveEndpoint, params: PardokParams): Promise<PardokPage>;
}

export class PardokLiveClient implements PardokLister {
  #lastRequestAt = 0;
  #slot: Promise<void> = Promise.resolve();
  readonly #timeoutMs: number;
  readonly #maxAttempts: number;
  readonly #pacingMs: number;

  constructor(
    private readonly apiKey: string,
    options: PardokLiveOptions = {}
  ) {
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.#pacingMs = options.pacingMs ?? DEFAULT_PACING_MS;
  }

  async list(endpoint: PardokLiveEndpoint, params: PardokParams): Promise<PardokPage> {
    const url = new URL(`${PARDOK_BASE}/${endpoint}`);
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'object')
        for (const item of value) url.searchParams.append(key, String(item));
      else url.searchParams.set(key, String(value));
    }
    const timeout = 'f.volltext' in params ? VOLLTEXT_TIMEOUT_MS : this.#timeoutMs;

    for (let attempt = 1; ; attempt++) {
      await this.#takeSlot();
      let res: Response;
      try {
        res = await fetch(url, {
          headers: { Accept: 'application/json', 'X-API-Key': this.apiKey },
          redirect: 'error',
          signal: AbortSignal.timeout(timeout),
        });
      } catch (error: unknown) {
        if (attempt >= this.#maxAttempts) throw error;
        await sleep(1500 * attempt);
        continue;
      }
      if (res.status === 429) {
        if (attempt >= this.#maxAttempts)
          throw new Error(`PARDOK rate limit persists on ${endpoint}`);
        const wait = Math.min(
          Number(res.headers.get('retry-after') ?? 5) * 1000,
          MAX_RETRY_AFTER_MS
        );
        log.warn(`[pardok] 429 on ${endpoint} — waiting ${wait}ms`);
        await sleep(wait);
        continue;
      }
      if (res.status >= 500) {
        if (attempt >= this.#maxAttempts) throw new Error(`PARDOK ${res.status} on ${endpoint}`);
        await sleep(1500 * attempt);
        continue;
      }
      // 400/403/422: unsere Anfrage oder der Schlüssel — eine Wiederholung ändert nichts.
      if (!res.ok) throw new Error(`PARDOK ${res.status} on ${endpoint}`);
      const body = (await res.json()) as {
        numFound?: number;
        cursor?: string;
        documents?: PardokRecord[];
      };
      return {
        numFound: body.numFound ?? 0,
        cursor: body.cursor ?? null,
        documents: body.documents ?? [],
      };
    }
  }

  async #takeSlot(): Promise<void> {
    const previous = this.#slot;
    let release!: () => void;
    this.#slot = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      const wait = this.#lastRequestAt + this.#pacingMs - Date.now();
      if (wait > 0) await sleep(wait);
      this.#lastRequestAt = Date.now();
    } finally {
      release();
    }
  }
}

let singleton: PardokLiveClient | null = null;

/** Ein Client für alle Anfragen: nur so gilt der Takt prozessweit. */
export function getPardok(): PardokLiveClient {
  if (!singleton) {
    if (!env.PARDOK_API_KEY) throw new Error('PARDOK_API_KEY is not set');
    singleton = new PardokLiveClient(env.PARDOK_API_KEY);
  }
  return singleton;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
