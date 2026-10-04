/**
 * Schlanker Client für das Open-Data-Angebot des österreichischen Parlaments
 * (www.parlament.gv.at, CC BY 4.0).
 *
 * Drei Zugänge: die Filterliste (`POST /Filter/api/filter/data/101`) liefert
 * eine ganze Gesetzgebungsperiode eines Gegenstandstyps in EINER Antwort; jede
 * Geschichtsseite (`/gegenstand/…`) und jede Sitzung gibt es mit `?json=true`
 * als JSON; Volltexte liegen als HTML (`fnameorig_*.html`) oder PDF daneben.
 * Ein dokumentiertes Rate-Limit gibt es nicht — der Client taktet selbst.
 */
import { createLogger } from '../../../../utils/logger.js';

const log = createLogger('ParlamentAtClient');

export const PARLAMENT_BASE_URL = 'https://www.parlament.gv.at';
const LIST_URL = `${PARLAMENT_BASE_URL}/Filter/api/filter/data/101?js=eval&showAll=true`;
const REQUEST_TIMEOUT_MS = 90_000;
const MAX_ATTEMPTS = 4;
const PACING_MS = 500;
const RATE_LIMIT_COOLDOWN_MS = 30_000;

/** Verhandlungsgegenstände der Filterliste: Anträge, Regierungsvorlagen, schriftliche Anfragen. */
export type Vhg = 'ANTR' | 'RV' | 'J_JPR_M';

export interface ListRow {
  gp: string;
  ityp: string;
  inr: string;
  hisUrl: string;
  title: string;
  zitation: string;
  doktypLang: string;
  datum: string | null;
  datumSort: string;
  status: string;
  phasenBis: string;
  fraktionen: string[];
  themen: string[];
}

export interface DocumentLink {
  link: string;
  type: string;
}

export interface GegenstandDocument {
  title: string;
  documents: DocumentLink[];
}

export interface GegenstandName {
  funktext?: string;
  name?: string;
  frak_code?: string | null;
  ltext?: string | null;
  url?: string | null;
}

export interface Gegenstand {
  title: string;
  zitation?: string;
  doktyp?: string;
  description?: string;
  einlangen?: string;
  documents?: GegenstandDocument[];
  names?: GegenstandName[];
  /** Roh, für Verweise (Beantwortung, Ressort), die in Stages oder Phasen stecken. */
  raw: string;
}

export interface Sitzung {
  title: string;
  einlangen?: string;
  stdocuments?: GegenstandDocument[];
  /**
   * HTML je Wortmeldung, in Reihenfolge. Bis das Stenographische Protokoll
   * einer Sitzung erscheint (das dauert Monate), gibt es nur diese vorläufigen,
   * nicht autorisierten Einzelprotokolle — im selben Randnummer-Format.
   */
  speechFragments: string[];
}

interface SitzungContent {
  title?: string;
  einlangen?: string;
  stdocuments?: GegenstandDocument[];
  progress?: Array<{
    speeches?: Array<{ protocol?: { data?: { links?: Array<{ documents?: DocumentLink[] }> } } }>;
  }>;
}

interface ListResponse {
  header: Array<{ feld_name?: string; label: string }>;
  rows: unknown[][];
}

export class ParlamentClient {
  #lastRequestAt = 0;

  async listGegenstaende(gp: string, vhg: Vhg): Promise<ListRow[]> {
    const bytes = await this.#fetch(LIST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ GP_CODE: [gp], VHG: [vhg] }),
    });
    if (!bytes) throw new Error(`Parlament list ${gp}/${vhg}: 404`);
    const data = parseJson<ListResponse>(bytes);
    const columns = data.header.map((h) => h.feld_name ?? h.label);
    return data.rows.map((row) =>
      toListRow(Object.fromEntries(columns.map((c, i) => [c, row[i]])))
    );
  }

  /** Geschichtsseite eines Gegenstands; `null`, wenn es ihn nicht (mehr) gibt. */
  async getGegenstand(hisUrl: string): Promise<Gegenstand | null> {
    const bytes = await this.#fetch(`${PARLAMENT_BASE_URL}${hisUrl}?json=true`);
    if (!bytes) return null;
    const raw = new TextDecoder().decode(bytes);
    const content = (JSON.parse(raw) as { content: Omit<Gegenstand, 'raw'> }).content;
    return { ...content, raw };
  }

  /** Sitzung `n` einer Periode; `null` hinter der letzten. */
  async getSitzung(gp: string, n: number): Promise<Sitzung | null> {
    const bytes = await this.#fetch(`${PARLAMENT_BASE_URL}/gegenstand/${gp}/NRSITZ/${n}?json=true`);
    if (!bytes) return null;
    const content = parseJson<{ content: SitzungContent[] }>(bytes).content;
    const head = content[0];
    if (!head) return null;
    const speechFragments = content
      .flatMap((c) => c.progress ?? [])
      .flatMap((p) => p.speeches ?? [])
      .flatMap((s) => s.protocol?.data?.links ?? [])
      .flatMap((l) => l.documents ?? [])
      .filter((d) => d.type === 'HTML')
      .map((d) => d.link);
    return {
      title: head.title ?? '',
      ...(head.einlangen ? { einlangen: head.einlangen } : {}),
      ...(head.stdocuments ? { stdocuments: head.stdocuments } : {}),
      speechFragments: [...new Set(speechFragments)],
    };
  }

  /**
   * HTML eines Dokuments. Ältere Word-Exporte deklarieren `us-ascii` und
   * enthalten trotzdem Latin-1-Bytes (die Sprecher-Marker im Protokoll); sie
   * werden als windows-1252 gelesen.
   */
  async getHtml(path: string): Promise<string | null> {
    const bytes = await this.#fetch(`${PARLAMENT_BASE_URL}${path}`);
    if (!bytes) return null;
    const head = new TextDecoder('latin1').decode(bytes.subarray(0, 4096));
    const legacy = /charset=["']?(?:us-ascii|windows-1252|iso-8859-1)/i.test(head);
    return new TextDecoder(legacy ? 'windows-1252' : 'utf-8').decode(bytes);
  }

  /**
   * Klub einer Person laut Personenseite, jüngstes Mandat zuerst. Regierungs-
   * mitglieder sprechen im Protokoll ohne Partei; wer nie ein Mandat hatte,
   * hat auch hier keinen Klub (`null`).
   */
  async getPersonKlub(personId: string): Promise<string | null> {
    const bytes = await this.#fetch(`${PARLAMENT_BASE_URL}/person/${personId}?json=true`);
    if (!bytes) return null;
    const json = parseJson<{
      content?: {
        biografie?: { mandatefunktionen?: { mandate?: Array<{ klub?: string | null }> } };
      };
    }>(bytes);
    const mandate = json.content?.biografie?.mandatefunktionen?.mandate ?? [];
    return mandate.map((m) => m.klub).find((klub): klub is string => Boolean(klub)) ?? null;
  }

  async getBytes(path: string): Promise<Uint8Array | null> {
    return this.#fetch(`${PARLAMENT_BASE_URL}${path}`);
  }

  /**
   * Body als Bytes; `null` bei 404, wirft bei allem anderen, was nach den
   * Wiederholungen nicht ok ist. Der Body wird INNERHALB der Wiederholung
   * gelesen: die Periodenlisten sind mehrere MB groß, und ein Abbruch mitten im
   * Body ist genauso vorübergehend wie einer vor den Headern.
   */
  async #fetch(url: string, init: RequestInit = {}): Promise<Uint8Array | null> {
    for (let attempt = 1; ; attempt++) {
      const wait = this.#lastRequestAt + PACING_MS - Date.now();
      if (wait > 0) await sleep(wait);
      this.#lastRequestAt = Date.now();

      let res: Response;
      let body: Uint8Array;
      try {
        res = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
        body = new Uint8Array(await res.arrayBuffer());
      } catch (error: unknown) {
        if (attempt >= MAX_ATTEMPTS) throw error;
        await sleep(2000 * attempt);
        continue;
      }

      if (res.status === 404) return null;
      if (res.status === 429) {
        if (attempt >= MAX_ATTEMPTS) throw new Error(`Parlament rate limit persists on ${url}`);
        log.warn(`[parlament-at] 429 on ${url} — cooling down ${RATE_LIMIT_COOLDOWN_MS}ms`);
        await sleep(RATE_LIMIT_COOLDOWN_MS);
        continue;
      }
      if (res.status >= 500) {
        if (attempt >= MAX_ATTEMPTS) throw new Error(`Parlament ${res.status} on ${url}`);
        await sleep(2000 * attempt);
        continue;
      }
      if (!res.ok) throw new Error(`Parlament ${res.status} on ${url}`);
      return body;
    }
  }
}

function parseJson<T>(bytes: Uint8Array): T {
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

function toListRow(row: Record<string, unknown>): ListRow {
  const str = (key: string) => (typeof row[key] === 'string' ? (row[key] as string) : '');
  const datumVon = str('DATUM_VON');
  return {
    gp: str('GP_CODE') || str('GP'),
    ityp: str('ITYP'),
    inr: str('INR'),
    hisUrl: str('HIS_URL'),
    title: str('PFAD'),
    zitation: str('ZITATION'),
    doktypLang: str('DOKTYP_LANG'),
    datum: datumVon ? datumVon.slice(0, 10) : null,
    datumSort: str('DATUMSORT'),
    status: str('STATUS'),
    phasenBis: str('PHASEN_BIS'),
    fraktionen: jsonList(row.FRAK_CODE),
    themen: jsonList(row.THEMEN),
  };
}

/** Listenfelder kommen als JSON-String (`'["FPÖ"]'`), leer als `'[""]'` oder `null`. */
function jsonList(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === 'string' && v.trim() !== '')
      : [];
  } catch {
    return [];
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
