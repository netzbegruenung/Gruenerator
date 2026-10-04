/**
 * ParlamentAtScraper
 *
 * Hält `parlament_at_documents` aktuell: Plenarreden des Nationalrats, Anträge,
 * Regierungsvorlagen und schriftliche Anfragen samt Beantwortung aus dem
 * Open-Data-Angebot des österreichischen Parlaments (CC BY 4.0). Stellungnahmen
 * sind dort ausdrücklich nicht freigegeben und bleiben draußen.
 *
 * Der nächtliche Lauf deckt die laufende Gesetzgebungsperiode ab; den Bestand
 * älterer Perioden schreibt `scripts/backfill-parlament-at.ts` über denselben
 * Code. Zwei Gatter halten den Lauf klein:
 *
 * - **Gegenstände**: Die Filterliste liefert eine ganze Periode in einer
 *   Antwort. Jede Zeile bekommt einen Fingerprint aus Datum, Status und Phase
 *   (`row_hash`); ist er unverändert, wird die Geschichtsseite gar nicht erst
 *   geladen. Eine eingelangte Beantwortung ändert den Status der Anfrage.
 * - **Sitzungen**: Die jüngsten Sitzungen werden je Lauf neu angesehen, weil das
 *   endgültige Protokoll das vorläufige erst Wochen später ersetzt. Gemerkt wird
 *   der Pfad des Protokoll-HTML — solange er gleich bleibt, wird nichts geladen.
 *
 * Danach entscheidet wie beim DIP-Scraper der Hash des Volltexts.
 */
import { getQdrantInstance } from '../../../../database/services/QdrantService/index.js';
import { createLogger } from '../../../../utils/logger.js';
import { mistralEmbeddingService } from '../../../mistral/index.js';
import { extractPdfText } from '../../../pdf/pdfText.js';
import { BaseScraper } from '../../base/BaseScraper.js';
import { writeParent, type ParentDoc, type ParentStoreConfig } from '../../utils/parentStore.js';

import {
  PARLAMENT_COLLECTION,
  PARLAMENT_SOURCE,
  atPointId,
  buildGegenstandParent,
  buildSitzungParent,
  gegenstandParentId,
  sitzungParentId,
  type AtContentType,
  type GegenstandPart,
} from './builders.js';
import { normalizeParties, normalizeParty } from './factions.js';
import { gegenstandText } from './gegenstandHtml.js';
import {
  ParlamentClient,
  type DocumentLink,
  type Gegenstand,
  type ListRow,
  type Vhg,
} from './parlamentClient.js';
import { parseProtokoll } from './protokollHtml.js';

import type { ScraperResult } from '../../types.js';
import type { QdrantClient } from '@qdrant/js-client-rest';

const log = createLogger('ParlamentAtScraper');

export const CURRENT_GP = 'XXVIII';
export const PARLAMENT_KINDS = ['rede', 'antrag', 'rv', 'anfrage'] as const;
export type ParlamentKind = (typeof PARLAMENT_KINDS)[number];

const VHG_OF: Record<Exclude<ParlamentKind, 'rede'>, Vhg> = {
  antrag: 'ANTR',
  rv: 'RV',
  anfrage: 'J_JPR_M',
};
const CONTENT_TYPE_OF: Record<Exclude<ParlamentKind, 'rede'>, AtContentType> = {
  antrag: 'antrag',
  rv: 'regierungsvorlage',
  anfrage: 'anfrage',
};
// Das endgültige Protokoll folgt dem vorläufigen nach einigen Wochen; so viele
// Sitzungen zurück wird jede Nacht nachgesehen.
const SITZUNG_RECHECK = 20;
// Textgegenüberstellungen wiederholen den Gesetzestext als Tabelle.
const SKIPPED_DOCUMENTS = /Textgegenüberstellung|Stellungnahme/i;
const MIN_PDF_TEXT_CHARS = 200;

const STORE: ParentStoreConfig = {
  collection: PARLAMENT_COLLECTION,
  source: PARLAMENT_SOURCE,
  pointId: atPointId,
};

interface StoredState {
  contentHash: string | null;
  rowHash: string | null;
}

export interface ParlamentScrapeOptions {
  forceUpdate?: boolean;
  dryRun?: boolean;
  gps?: readonly string[];
  kinds?: readonly ParlamentKind[];
  /** Höchstens so viele Quellen laden (Probeläufe). */
  limit?: number;
}

export interface ParlamentScrapeSummary {
  stored: number;
  updated: number;
  skipped: number;
  /** Ohne Volltext-HTML (z. B. nur gescanntes PDF) — gezählt, nicht geschrieben. */
  noFulltext: number;
  fetchErrors: number;
  errors: number;
  units: number;
  chars: number;
}

export class ParlamentAtScraper extends BaseScraper {
  private qdrantClient!: QdrantClient;
  private parlament = new ParlamentClient();
  private stored = new Map<string, StoredState>();
  private klubCache = new Map<string, string | null>();
  private fetched = 0;

  constructor() {
    super({ collectionName: PARLAMENT_COLLECTION, baseUrl: 'https://www.parlament.gv.at' });
  }

  async init(): Promise<void> {
    const qdrant = getQdrantInstance();
    await qdrant.init(); // legt parlament_at_documents aus COLLECTION_SCHEMAS an
    await mistralEmbeddingService.init();
    this.qdrantClient = qdrant.client!;
  }

  async scrape(): Promise<ScraperResult> {
    await this.scrapeAllSources({});
    return this.buildResult();
  }

  async scrapeAllSources(options: ParlamentScrapeOptions): Promise<ParlamentScrapeSummary> {
    const summary: ParlamentScrapeSummary = {
      stored: 0,
      updated: 0,
      skipped: 0,
      noFulltext: 0,
      fetchErrors: 0,
      errors: 0,
      units: 0,
      chars: 0,
    };
    this.initializeSession();
    this.fetched = 0;
    this.stored = await this.loadStoredState();
    const gps = options.gps ?? [CURRENT_GP];
    const kinds = options.kinds ?? PARLAMENT_KINDS;

    for (const gp of gps) {
      for (const kind of kinds) {
        try {
          if (kind === 'rede') await this.syncSitzungen(gp, options, summary);
          else await this.syncGegenstaende(gp, kind, options, summary);
        } catch (error: unknown) {
          summary.fetchErrors += 1;
          log.error(`[parlament-at] ${kind} ${gp}: ${errorMessage(error)}`);
        }
      }
    }

    log.info(`[parlament-at] done: ${JSON.stringify(summary)}`);
    return summary;
  }

  private limitReached(options: ParlamentScrapeOptions): boolean {
    return options.limit !== undefined && this.fetched >= options.limit;
  }

  private async syncSitzungen(
    gp: string,
    options: ParlamentScrapeOptions,
    summary: ParlamentScrapeSummary
  ): Promise<void> {
    const prefix = `nrsitz:${gp}:`;
    const known = [...this.stored.keys()]
      .filter((id) => id.startsWith(prefix))
      .map((id) => Number(id.slice(prefix.length)));
    const start = options.forceUpdate ? 1 : Math.max(1, Math.max(0, ...known) - SITZUNG_RECHECK);

    for (let n = start; !this.limitReached(options); n++) {
      const sitzung = await this.parlament.getSitzung(gp, n);
      if (!sitzung) return;
      const protokoll = (sitzung.stdocuments ?? [])
        .filter((d) => /Protokoll/i.test(d.title) && !/Inhaltsverzeichnis/i.test(d.title))
        .flatMap((d) => d.documents)
        .find((d) => d.type === 'HTML');
      if (!protokoll) continue; // Protokoll noch nicht veröffentlicht

      const parentId = sitzungParentId(gp, n);
      const stored = this.stored.get(parentId);
      if (!options.forceUpdate && stored?.rowHash === protokoll.link) {
        summary.skipped += 1;
        continue;
      }

      this.fetched += 1;
      const html = await this.parlament.getHtml(protokoll.link);
      if (!html) {
        summary.fetchErrors += 1;
        continue;
      }
      const speeches = parseProtokoll(html);
      const contentHash = this.generateHash(speeches.map((s) => s.text).join('\n\f\n'));
      if (!options.forceUpdate && stored?.contentHash === contentHash) {
        await this.refreshRowHash(parentId, protokoll.link, options);
        summary.skipped += 1;
        continue;
      }

      const klubs = await this.governmentKlubs(
        speeches.filter((s) => s.isGovernment && !s.party).map((s) => s.personId)
      );
      const parent = buildSitzungParent(
        { gp, n, datum: sitzung.einlangen?.slice(0, 10) ?? null, protokollPath: protokoll.link },
        speeches,
        (personId) => (personId ? (klubs.get(personId) ?? null) : null),
        { contentHash, rowHash: protokoll.link }
      );
      await this.write(parent, stored !== undefined, options, summary);
    }
  }

  private async syncGegenstaende(
    gp: string,
    kind: Exclude<ParlamentKind, 'rede'>,
    options: ParlamentScrapeOptions,
    summary: ParlamentScrapeSummary
  ): Promise<void> {
    const rows = (await this.parlament.listGegenstaende(gp, VHG_OF[kind])).filter(
      // In der Anfragen-Liste stehen auch Anfragen an die Präsidentin (JPR) und
      // mündliche Anfragen (M) — nur die schriftlichen haben eine Beantwortung.
      (row) => kind !== 'anfrage' || row.ityp === 'J'
    );
    log.info(`[parlament-at] ${kind} ${gp}: ${rows.length} rows`);

    for (const row of rows) {
      if (this.limitReached(options)) return;
      const parentId = gegenstandParentId(row.gp, row.ityp, row.inr);
      const rowHash = this.generateHash(`${row.datumSort}|${row.status}|${row.phasenBis}`);
      const stored = this.stored.get(parentId);
      if (!options.forceUpdate && stored?.rowHash === rowHash) {
        summary.skipped += 1;
        continue;
      }

      this.fetched += 1;
      try {
        const gegenstand = await this.parlament.getGegenstand(row.hisUrl);
        if (!gegenstand) {
          summary.fetchErrors += 1;
          continue;
        }
        const ministerium =
          (gegenstand.names ?? []).find((n) => /^Eingebracht an/i.test(n.funktext ?? ''))?.ltext ??
          ministeriumOf(gegenstand.raw);
        const parts = await this.collectParts(row, gegenstand, CONTENT_TYPE_OF[kind]);
        if (parts.length === 0) {
          summary.noFulltext += 1;
          continue;
        }
        const contentHash = this.generateHash(
          parts.map((p) => `${p.title}\n${p.party.join('|')}\n${p.text}`).join('\n\f\n')
        );
        if (!options.forceUpdate && stored?.contentHash === contentHash) {
          await this.refreshRowHash(parentId, rowHash, options);
          summary.skipped += 1;
          continue;
        }
        const parent = buildGegenstandParent(
          {
            row,
            ministerium: ministerium ?? parts.find((p) => p.ministerium)?.ministerium ?? null,
          },
          parts,
          { contentHash, rowHash }
        );
        await this.write(parent, stored !== undefined, options, summary);
      } catch (error: unknown) {
        summary.fetchErrors += 1;
        log.warn(`[parlament-at] ${row.hisUrl}: ${errorMessage(error)}`);
      }
    }
  }

  /** Volltext-Dokumente eines Gegenstands; bei Anfragen samt Beantwortung. */
  private async collectParts(
    row: ListRow,
    gegenstand: Gegenstand,
    contentType: AtContentType
  ): Promise<Array<GegenstandPart & { ministerium?: string | null }>> {
    const submitters = normalizeParties(
      (gegenstand.names ?? [])
        // „Eingebracht an" ist das befragte Regierungsmitglied, nicht der Klub der Anfrage.
        .filter((n) => /^Eingebracht von/i.test(n.funktext ?? ''))
        .map((n) => n.frak_code ?? null)
    );
    const party = submitters.length > 0 ? submitters : normalizeParties(row.fraktionen);
    const parts: Array<GegenstandPart & { ministerium?: string | null }> = [];

    for (const { title, link } of fulltextDocuments(gegenstand)) {
      const text = await this.documentText(link);
      if (!text) continue;
      parts.push({
        contentType,
        title: cleanDocumentTitle(title),
        path: link.link,
        text,
        party,
        publishedAt: row.datum,
      });
    }
    if (parts.length === 0) return parts;

    if (contentType === 'anfrage') {
      for (const abUrl of answerUrls(gegenstand.raw, row.gp)) {
        const answer = await this.collectAnswer(abUrl);
        if (answer) parts.push(answer);
      }
    }
    return parts;
  }

  /**
   * Die Beantwortung ist ein eigener Gegenstand und meist nur ein PDF — eines
   * mit Textebene (Word-Export des Ministeriums), kein Scan; OCR braucht es nicht.
   */
  private async collectAnswer(
    abUrl: string
  ): Promise<(GegenstandPart & { ministerium: string | null }) | null> {
    const answer = await this.parlament.getGegenstand(abUrl);
    if (!answer) return null;
    const [document] = fulltextDocuments(answer);
    const text = document ? await this.documentText(document.link) : '';
    if (!document || !text) return null;
    const responder = (answer.names ?? []).find((n) => /Beantwortet/i.test(n.funktext ?? ''));
    const party = normalizeParty(responder?.frak_code ?? null);
    return {
      contentType: 'anfragebeantwortung',
      title: `Anfragebeantwortung ${answer.zitation ?? ''}`.trim(),
      path: document.link.link,
      text,
      party: party ? [party] : [],
      speaker: responder?.name ?? null,
      publishedAt: answer.einlangen?.slice(0, 10) ?? null,
      ministerium: responder?.ltext ?? null,
    };
  }

  private async documentText(link: DocumentLink): Promise<string> {
    if (link.type === 'HTML')
      return gegenstandText((await this.parlament.getHtml(link.link)) ?? '');
    const bytes = await this.parlament.getBytes(link.link);
    if (!bytes) return '';
    const text = (await extractPdfText(bytes)).trim();
    // Ein PDF ohne Textebene liefert nur Seitenreste; OCR gibt es hier bewusst nicht.
    return text.length >= MIN_PDF_TEXT_CHARS ? text : '';
  }

  private async governmentKlubs(personIds: Array<string | null>): Promise<Map<string, string>> {
    const klubs = new Map<string, string>();
    for (const id of new Set(personIds)) {
      if (!id) continue;
      if (!this.klubCache.has(id)) {
        this.klubCache.set(id, normalizeParty(await this.parlament.getPersonKlub(id)));
      }
      const klub = this.klubCache.get(id);
      if (klub) klubs.set(id, klub);
    }
    return klubs;
  }

  private async write(
    parent: ParentDoc,
    known: boolean,
    options: ParlamentScrapeOptions,
    summary: ParlamentScrapeSummary
  ): Promise<void> {
    if (parent.units.length === 0) {
      summary.skipped += 1;
      return;
    }
    summary.units += parent.units.length;
    summary.chars += parent.units.reduce((sum, u) => sum + u.text.length, 0);
    if (!options.dryRun) {
      try {
        this.stats.vectorsStored += await writeParent(this.qdrantClient, STORE, parent);
      } catch (error: unknown) {
        summary.errors += 1;
        log.warn(`[parlament-at] ${parent.parentId} failed: ${errorMessage(error)}`);
        return;
      }
    }
    if (known) summary.updated += 1;
    else summary.stored += 1;
  }

  /** Volltext unverändert, Liste aber nicht — der neue Fingerprint spart den Abruf beim nächsten Mal. */
  private async refreshRowHash(
    parentId: string,
    rowHash: string,
    options: ParlamentScrapeOptions
  ): Promise<void> {
    if (options.dryRun) return;
    await this.qdrantClient.setPayload(PARLAMENT_COLLECTION, {
      payload: { row_hash: rowHash },
      filter: { must: [{ key: 'parent_id', match: { value: parentId } }] },
      wait: true,
    });
  }

  /** Einmal je Lauf: Hashes aller Quellen aus den Kopf-Chunks. */
  private async loadStoredState(): Promise<Map<string, StoredState>> {
    const state = new Map<string, StoredState>();
    let offset: string | number | undefined;
    for (;;) {
      const page = await this.qdrantClient.scroll(PARLAMENT_COLLECTION, {
        filter: { must: [{ key: 'chunk_index', match: { value: 0 } }] },
        limit: 1000,
        with_payload: ['parent_id', 'content_hash', 'row_hash'],
        with_vector: false,
        ...(offset !== undefined ? { offset } : {}),
      });
      for (const point of page.points) {
        const payload = point.payload ?? {};
        if (typeof payload.parent_id !== 'string') continue;
        state.set(payload.parent_id, {
          contentHash: typeof payload.content_hash === 'string' ? payload.content_hash : null,
          rowHash: typeof payload.row_hash === 'string' ? payload.row_hash : null,
        });
      }
      const next = page.next_page_offset;
      if (typeof next !== 'string' && typeof next !== 'number') return state;
      offset = next;
    }
  }
}

/**
 * Welche Dokumente einer Geschichtsseite Volltext tragen. Das HTML ist die
 * elektronisch übermittelte Fassung; gibt es eines, ist jedes PDF daneben nur
 * das gescannte Original oder ein Anhang (Vorblatt/WFA) — sie würden den Text
 * doppeln. Ohne HTML (unselbständige Entschließungs- und Abänderungsanträge,
 * die meisten Beantwortungen) bleibt das erste PDF: es hat eine Textebene.
 */
export function fulltextDocuments(
  gegenstand: Pick<Gegenstand, 'documents'>
): Array<{ title: string; link: DocumentLink }> {
  const groups = (gegenstand.documents ?? []).filter((d) => !SKIPPED_DOCUMENTS.test(d.title));
  const html = groups.flatMap((d) => {
    const link = d.documents.find((l) => l.type === 'HTML');
    return link ? [{ title: d.title, link }] : [];
  });
  if (html.length > 0) return html;
  for (const d of groups) {
    const link = d.documents.find((l) => l.type === 'PDF');
    if (link) return [{ title: d.title, link }];
  }
  return [];
}

/** „Übermittlung an das Bundesministerium für …" aus den Stages der Anfrage. */
export function ministeriumOf(raw: string): string | null {
  const m = /Übermittlung an (?:das|den|die) ((?:Bundesministerium|Bundeskanzleramt)[^"<\\]*)/.exec(
    raw
  );
  return m ? m[1].trim() : null;
}

export function answerUrls(raw: string, gp: string): string[] {
  const pattern = new RegExp(`/gegenstand/${gp}/AB/\\d+`, 'g');
  return [...new Set(raw.match(pattern) ?? [])];
}

/** „Anfrage (elektr. übermittelte Version)" → „Anfrage". */
function cleanDocumentTitle(title: string): string {
  return title.replace(/\s*\((?:elektr\.|textinterpretierte|gescanntes)[^)]*\)\s*$/i, '').trim();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

let instance: ParlamentAtScraper | null = null;

export function getParlamentAtScraperService(): ParlamentAtScraper {
  if (!instance) instance = new ParlamentAtScraper();
  return instance;
}
