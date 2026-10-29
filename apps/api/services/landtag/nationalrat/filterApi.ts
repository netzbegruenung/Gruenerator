/**
 * Lesender Zugriff auf die Filter-API des österreichischen Parlaments
 * (`parlament.gv.at`, ohne Schlüssel) für das Chat-Werkzeug `nationalrat`.
 *
 * Gemessen am 28./29.10.2026:
 *  - `POST /Filter/api/filter/data/101` (Gegenstände) und `/211` (Stenographische
 *    Protokolle), Body = Filter als Arrays (ODER innerhalb eines Schlüssels).
 *    Zeilen sind positional; die Namen stehen in `header[].label`.
 *  - Es gibt keine Text- und keine Datumssuche (`DATUM_VON` wird still
 *    ignoriert), und `showAll` liefert alles auf einmal. Deshalb holt dieser
 *    Client je Gesetzgebungsperiode EINE Liste der lesbaren Arten (XXVIII.: 2.267
 *    Zeilen, 1,5 MB, 2,5 s), hält sie eine halbe Stunde und `find.ts` filtert
 *    lokal.
 *  - Die Detailseite eines Gegenstands gibt es mit `?json=true` als JSON; sie
 *    nennt die Dokumente (HTML und PDF) samt Links. Bei einer Sitzung steht dort
 *    auch das vorläufige Protokoll (`stdocuments`), solange die Liste 211 noch
 *    kein Gesamtprotokoll trägt — am 30.10.2026 bei 51 von 104 Sitzungen (Nr. 52
 *    und alles ab Nr. 55) —, und je Rede eine eigene HTML-Datei mit dem
 *    vollen, noch nicht autorisierten Wortlaut (`stages[].reden`).
 */
import { createLogger } from '../../../utils/logger.js';
import { fetchBytes } from '../../bundestag/qa/fetchTexts.js';

const log = createLogger('NationalratFilterApi');

export const PARLAMENT_HOST = 'www.parlament.gv.at';
export const PARLAMENT_BASE = `https://${PARLAMENT_HOST}`;

const TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 2;
const LIST_TTL_MS = 30 * 60_000;

/**
 * Die Verfahrensarten (`VHG`), deren Texte frei lesbar sind: Regierungsvorlagen
 * (Gesetze, Staatsverträge), Ausschussberichte und Anträge. Schriftliche Anfragen
 * (`J_JPR_M`) und Beantwortungen (`AB_ABPR_ABM`) fehlen absichtlich: ihre Texte
 * sind von der CC-BY-Lizenz ausgenommen (#5114).
 */
const LIST_VHG = ['RV', 'RVS', 'AUB', 'ANTR'] as const;

/** Eine Zeile der Filter-API mit den Spaltennamen als Schlüssel. */
export type NrRow = Record<string, unknown>;

/** Ein Eintrag aus `content.documents[].documents[]` der Detailseite. */
export interface NrDocLink {
  gruppe: string;
  link: string;
  type: string;
}

/** Eine Wortmeldung einer Sitzung: eigene HTML-Datei mit dem Wortlaut der Rede. */
export interface NrRede {
  /** „12:24:50 - Michael Fürtbauer (FPÖ) - TOP 2 …“ */
  titel: string;
  link: string;
}

export interface NationalratApi {
  /** Gegenstände der lesbaren Arten einer Gesetzgebungsperiode („XXVIII"). */
  gegenstaende(gp: string): Promise<NrRow[]>;
  /** Stenographische Protokolle der Nationalratssitzungen einer Gesetzgebungsperiode. */
  protokolle(gp: string): Promise<NrRow[]>;
  /** Dokumentlinks der Detailseite (`/gegenstand/XXVIII/I/123`). */
  dokumente(hisUrl: string, signal: AbortSignal): Promise<NrDocLink[]>;
  /** Die Reden einer Sitzung (`/gegenstand/XXVIII/NRSITZ/103`) in der Reihenfolge der Tagesordnung. */
  reden(hisUrl: string, signal: AbortSignal): Promise<NrRede[]>;
}

type Gruppe = { title?: string; documents?: { link?: string; type?: string }[] };
type Seite = {
  documents?: Gruppe[];
  stdocuments?: Gruppe[];
  stages?: { reden?: { data?: { rows?: unknown[][] } } }[];
};

/** Positionale Zeilen → Objekte; die Spalte `Art` kommt in 211 doppelt vor, die erste gewinnt. */
export function rowsOf(body: { header?: { label: string }[]; rows?: unknown[][] }): NrRow[] {
  const labels = (body.header ?? []).map((h) => h.label);
  return (body.rows ?? []).map((r) => {
    const row: NrRow = {};
    labels.forEach((label, i) => {
      if (!(label in row)) row[label] = r[i];
    });
    return row;
  });
}

async function postFilter(list: '101' | '211', filter: Record<string, string[]>): Promise<NrRow[]> {
  const url = `${PARLAMENT_BASE}/Filter/api/filter/data/${list}?js=eval&showAll=true`;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(filter),
        redirect: 'error',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status >= 400 && res.status < 500) {
        // Unsere Anfrage ist falsch: eine Wiederholung ändert nichts.
        throw Object.assign(new Error(`parlament.gv.at ${res.status} on ${list}`), {
          final: true,
        });
      }
      if (!res.ok) throw new Error(`parlament.gv.at ${res.status} on ${list}`);
      return rowsOf((await res.json()) as Parameters<typeof rowsOf>[0]);
    } catch (error: unknown) {
      if (attempt >= MAX_ATTEMPTS || (error as { final?: boolean }).final) throw error;
      log.warn(`[nationalrat] Liste ${list}: ${String(error)} — neuer Versuch`);
    }
  }
}

export class NationalratFilterApi implements NationalratApi {
  readonly #cache = new Map<string, { at: number; rows: Promise<NrRow[]> }>();

  #cached(key: string, load: () => Promise<NrRow[]>): Promise<NrRow[]> {
    const hit = this.#cache.get(key);
    if (hit && Date.now() - hit.at < LIST_TTL_MS) return hit.rows;
    const rows = load();
    this.#cache.set(key, { at: Date.now(), rows });
    // Ein Fehlschlag bleibt nicht eine halbe Stunde lang im Cache stehen.
    rows.catch(() => this.#cache.delete(key));
    return rows;
  }

  gegenstaende(gp: string): Promise<NrRow[]> {
    return this.#cached(`101:${gp}`, async () =>
      (await postFilter('101', { GP_CODE: [gp], VHG: [...LIST_VHG] })).filter(
        // Der Bundesrat führt eigene Gegenstände in derselben Liste.
        (r) => r.NRBR === 'NR'
      )
    );
  }

  protokolle(gp: string): Promise<NrRow[]> {
    return this.#cached(`211:${gp}`, () =>
      postFilter('211', { GP_CODE: [gp], DOKTYP: ['NRSITZ'] })
    );
  }

  async #seite(hisUrl: string, signal: AbortSignal): Promise<Seite | undefined> {
    const bytes = await fetchBytes(`${PARLAMENT_BASE}${hisUrl}?json=true`, signal, PARLAMENT_HOST);
    const body = JSON.parse(new TextDecoder().decode(bytes)) as { content?: Seite | Seite[] };
    // Gegenstände liefern die Seite als Objekt, Sitzungen als Liste (Seite zuerst).
    return Array.isArray(body.content) ? body.content[0] : body.content;
  }

  async reden(hisUrl: string, signal: AbortSignal): Promise<NrRede[]> {
    const seite = await this.#seite(hisUrl, signal);
    // Je Tagesordnungspunkt eine Tabelle „Wortmeldungen in der Debatte“; Spalte 3 verlinkt
    // die Rede samt Sprungmarke (`…/A_-_10_43_57_01034679.html#16`).
    const rows = (seite?.stages ?? []).flatMap((s) => s.reden?.data?.rows ?? []);
    const seen = new Set<string>();
    return rows.flatMap((r) =>
      (Array.isArray(r[2]) ? (r[2] as { url?: string; title?: string }[]) : []).flatMap((d) => {
        const link = d.url?.split('#')[0];
        if (!link || seen.has(link)) return [];
        seen.add(link);
        return [{ titel: d.title ?? '', link }];
      })
    );
  }

  async dokumente(hisUrl: string, signal: AbortSignal): Promise<NrDocLink[]> {
    const seite = await this.#seite(hisUrl, signal);
    // `stdocuments`: das (vorläufige) stenographische Protokoll einer Sitzung.
    const groups = [seite?.documents, seite?.stdocuments].flatMap((g) =>
      Array.isArray(g) ? g : []
    );
    return groups.flatMap((g) =>
      (g.documents ?? []).flatMap((d) =>
        d.link ? [{ gruppe: g.title ?? '', link: d.link, type: d.type ?? '' }] : []
      )
    );
  }
}

let singleton: NationalratFilterApi | null = null;

/** Ein Client für alle Anfragen: nur so teilen sie sich den Listen-Cache. */
export function getNationalratApi(): NationalratFilterApi {
  singleton ??= new NationalratFilterApi();
  return singleton;
}
