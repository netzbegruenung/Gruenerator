/**
 * Schlanker Client für die DIP-API des Bundestags (search.dip.bundestag.de).
 *
 * Geteilt zwischen dem Scraper und dem Bundestag-Q&A. Der Scraper liest die
 * zwei Volltext-Listen: die `-text`-Endpunkte liefern den Volltext direkt in
 * der Liste, ein zweiter Abruf je Dokument entfällt. Geblättert wird per
 * `cursor`: DIP gibt so lange einen neuen Cursor zurück, bis die Liste
 * erschöpft ist — das Ende erkennt man daran, dass der Cursor sich nicht mehr
 * ändert. Das Q&A holt dagegen mit `list` genau eine Seite der Abfrage-Endpunkte.
 */
import { createLogger } from '../../../utils/logger.js';

const log = createLogger('DipClient');

const BASE_URL = 'https://search.dip.bundestag.de/api/v1';
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_ATTEMPTS = 4;
const DEFAULT_PACING_MS = 500;
const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 30_000;

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

/** Drucksache ohne Volltext: Metadaten und der Bezug zu ihren Vorgängen. */
export interface DipDrucksache {
  id: string;
  dokumentnummer: string;
  drucksachetyp?: string;
  titel?: string;
  datum?: string;
  wahlperiode?: number;
  herausgeber?: string;
  aktualisiert?: string;
  urheber?: DipUrheber[];
  fundstelle?: DipFundstelle;
  vorgangsbezug?: { id: string; titel?: string; vorgangstyp?: string }[];
}

/** `fundstelle` am Deskriptor ist ein Flag (true = Schlagwort der Fundstelle), keine Quellenangabe. */
export interface DipDeskriptor {
  name: string;
  typ?: string;
  fundstelle?: boolean;
}

/** `initiative`, `sachgebiet` und `abstract` fehlen bei manchen Vorgangstypen (z. B. Schriftliche Frage). */
export interface DipVorgang {
  id: string;
  titel?: string;
  vorgangstyp?: string;
  wahlperiode?: number;
  datum?: string;
  initiative?: string[];
  sachgebiet?: string[];
  deskriptor?: DipDeskriptor[];
  abstract?: string;
}

/**
 * Die Fundstelle trägt je nach Dokumentart anderes: eine Drucksache hat
 * `dokumentnummer`/`pdf_url`, ein Plenarprotokoll `xml_url` samt Seitenspanne.
 */
export interface DipVorgangspositionFundstelle {
  id?: string;
  dokumentnummer?: string;
  drucksachetyp?: string;
  pdf_url?: string;
  xml_url?: string;
  anfangsseite?: number;
  endseite?: number;
  /** Urheber des Dokuments (bei Drucksachen z. B. `["Bundesregierung"]`), nicht der Initiator des Vorgangs. */
  urheber?: string[];
}

export interface DipVorgangsposition {
  vorgangsposition?: string;
  dokumentart?: string;
  datum?: string;
  fundstelle?: DipVorgangspositionFundstelle;
}

export type DipEndpoint =
  'drucksache' | 'drucksache-text' | 'plenarprotokoll-text' | 'vorgang' | 'vorgangsposition';

interface DipPage<T> {
  numFound?: number;
  cursor?: string;
  documents?: T[];
}

/** Eine Seite einer Liste, wie `list` sie zurückgibt. */
export interface DipListPage<T> {
  numFound: number;
  cursor: string | null;
  documents: T[];
}

/**
 * Ein Array wird als wiederholter Parameter gesendet. DIP wertet `f.id`
 * wiederholt als ODER, `f.deskriptor` wiederholt als UND.
 */
export type DipParams = Record<string, string | number | readonly (string | number)[]>;

export interface DipClientOptions {
  timeoutMs?: number;
  maxAttempts?: number;
  pacingMs?: number;
  rateLimitCooldownMs?: number;
}

export class DipClient {
  #lastRequestAt = 0;
  /** Kette der Takt-Plätze: gleichzeitige Aufrufer stellen sich hinten an, statt alle wait<=0 zu sehen. */
  #slot: Promise<void> = Promise.resolve();
  readonly #timeoutMs: number;
  readonly #maxAttempts: number;
  readonly #pacingMs: number;
  readonly #rateLimitCooldownMs: number;

  constructor(
    private readonly apiKey: string,
    options: DipClientOptions = {}
  ) {
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.#pacingMs = options.pacingMs ?? DEFAULT_PACING_MS;
    this.#rateLimitCooldownMs = options.rateLimitCooldownMs ?? DEFAULT_RATE_LIMIT_COOLDOWN_MS;
  }

  /** Genau eine Seite; wer weiterblättern will, reicht `cursor` in den Parametern zurück. */
  async list<T>(endpoint: DipEndpoint, params: DipParams): Promise<DipListPage<T>> {
    const page = await this.#get<T>(endpoint, params);
    return {
      numFound: page.numFound ?? 0,
      cursor: page.cursor ?? null,
      documents: page.documents ?? [],
    };
  }

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

  /** Wartet auf den Vorgänger, hält den Abstand ein und gibt den Platz erst nach dem Stempel frei. */
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

  async #get<T>(endpoint: string, params: DipParams): Promise<DipPage<T>> {
    const url = new URL(`${BASE_URL}/${endpoint}`);
    url.searchParams.set('apikey', this.apiKey);
    url.searchParams.set('format', 'json');
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'object') {
        for (const item of value) url.searchParams.append(key, String(item));
      } else {
        url.searchParams.set(key, String(value));
      }
    }

    for (let attempt = 1; ; attempt++) {
      await this.#takeSlot();

      let res: Response;
      try {
        res = await fetch(url, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(this.#timeoutMs),
        });
      } catch (error: unknown) {
        if (attempt >= this.#maxAttempts) throw error;
        await sleep(2000 * attempt);
        continue;
      }

      if (res.status === 429) {
        if (attempt >= this.#maxAttempts) throw new Error(`DIP rate limit persists on ${endpoint}`);
        log.warn(`[dip] 429 on ${endpoint} — cooling down ${this.#rateLimitCooldownMs}ms`);
        await sleep(this.#rateLimitCooldownMs);
        continue;
      }
      if (res.status >= 500) {
        if (attempt >= this.#maxAttempts) throw new Error(`DIP ${res.status} on ${endpoint}`);
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
