/**
 * Eine Seite lesen, die jemand BENANNT hat — die Person per @link oder Text,
 * der Planer aus einem Suchtreffer. Eine Stelle, weil `scrape_url` und der
 * Vorab-Abruf der @link-Seiten (`seedAttachedPages`) dieselbe Prüfung und
 * dasselbe Lesemass brauchen: liefen sie getrennt, könnte der Seed eine Adresse
 * holen, die das Werkzeug als SSRF-Ziel abweist.
 */
import { isCloudShareUrl } from '@gruenerator/shared/utils';

import {
  crawlableUrls,
  lastUserText,
} from '../../../agents/langgraph/ChatGraph/nodes/classifierHeuristics.js';
import { forbidsNewResearch } from '../../../agents/langgraph/ChatGraph/nodes/fastPathGuards.js';
import { selectAndCrawlTopUrls } from '../../../services/search/index.js';
import { createLogger } from '../../../utils/logger.js';
import { validateUrlForFetch } from '../../../utils/validation/urlSecurity.js';

import { agentAllowsWebSearch } from './searchTools.js';

import type { ChatGraphState, SearchResult } from '../../../agents/langgraph/ChatGraph/types.js';

const log = createLogger('namedPages');

/**
 * Wie viel einer benannten Seite das Modell direkt in der Quellenzeile sieht.
 *
 * Bis 11/2026 ein 8k-DESTILLAT: der Distiller verdichtete die Seite und
 * schnitt das Ergebnis vorn ab, ohne Vermerk. Auf der Startseite von
 * kommunal.de fehlte so jede zweite Autorin, und die Antwort zählte den Rest
 * als „alle angezeigten Beiträge" (#6103). Jetzt kommt der Text der Seite
 * selbst: bis zu dieser Länge ganz, darüber wird die Seite ein Dokument des
 * Threads (`namedPageDocuments`, dieselbe Schwelle wie bei Anhängen) und ist
 * mit `dokumente_lesen` vollständig lesbar. Wo das nicht geht (kein Thread),
 * steht der Anfang mit Abdeckungsvermerk da — `totalChars` am Ergebnis.
 */
export const CRAWL_SNIPPET_CHARS = 12_000;

/** `scrape_url` nimmt höchstens drei Adressen je Aufruf. */
export const MAX_NAMED_PAGES = 3;

export interface NamedPagesRead {
  /** Adressen, die die SSRF-Prüfung bestanden haben. */
  validated: string[];
  /** Adressen, die die SSRF-Prüfung abgewiesen hat — mit Grund, damit ein
   *  Teilerfolg als solcher kenntlich bleibt. */
  rejected: { url: string; grund: string }[];
  results: SearchResult[];
}

/** Vergleichsform für „diese Adresse wurde gelesen": der Crawler darf Slash und Fragment ändern. */
export function normalisiereUrl(url: string): string {
  return url.trim().replace(/#.*$/, '').replace(/\/+$/, '').toLowerCase();
}

export async function readNamedPages(urls: string[]): Promise<NamedPagesRead> {
  const validated: string[] = [];
  const rejected: { url: string; grund: string }[] = [];
  for (const raw of urls) {
    const check = await validateUrlForFetch(raw);
    if (check.isValid && check.url) validated.push(check.url.toString());
    else {
      log.warn(`[scrape_url] rejected URL: ${check.error ?? 'invalid'}`);
      rejected.push({ url: raw, grund: check.error ?? 'ungültige oder nicht erlaubte Adresse' });
    }
  }
  if (validated.length === 0) return { validated, rejected, results: [] };
  const seeds = validated.map((url, idx) => ({
    url,
    title: url,
    content: '',
    relevance: 1 - idx * 0.1,
  }));
  // Der ganze Text, strukturerhaltend — nicht verdichtet und nicht nach der
  // Frage gefiltert: die Seite wurde BENANNT, und was das Modell davon nicht
  // sieht, muss es als fehlend erkennen können (`totalChars`).
  const crawled = await selectAndCrawlTopUrls(seeds, '', {
    maxUrls: MAX_NAMED_PAGES,
    timeout: 15_000,
    structured: true,
  });
  const results: SearchResult[] = crawled.flatMap((r) => {
    const content = r.crawled && r.fullContent ? pageDocumentText(r.fullContent) : '';
    if (!content || !r.url) return [];
    return [
      {
        source: 'web',
        url: r.url,
        title: r.pageTitle?.trim() || pageLabel(r.url),
        content,
        totalChars: content.length,
        crawled: true,
      },
    ];
  });
  return { validated, rejected, results };
}

/**
 * Der Text einer gelesenen Seite, wie er ins Modell und ins Dokument geht:
 * das Markdown des Crawlers ohne Bilder und ohne Link-Ziele. Gemessen an der
 * Startseite von kommunal.de (26.11.2026): 71.019 Zeichen Markdown, davon
 * 20.076 Text — der Rest waren Bild-Pfade und Link-Adressen. Überschriften,
 * Absätze und die „von …"-Zeile je Teaser bleiben erhalten.
 */
export function pageDocumentText(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\((?:[^()]|\([^)]*\))*\)/g, '$1')
    .replace(/^[ \t]*[[\]][ \t]*$/gm, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Der feste Name einer Seite als Anhang: Host und Pfad, ohne Protokoll, `www.`
 * und Schrägstrich am Ende — `kommunal.de`, `gruene.de/themen/klima`. Aus der
 * Adresse, nicht aus dem Titel, damit ein späterer Turn dieselbe Seite am
 * Namen wiedererkennt, ohne sie erneut zu laden.
 */
export function pageLabel(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, '');
    return `${u.host.replace(/^www\./, '')}${path}`.slice(0, 120);
  } catch {
    return url.slice(0, 120);
  }
}

/**
 * Die Seiten, die der Loop vorab liest — dieselbe Auswahl, die der
 * Klassifikator für den Einzeldurchlauf trifft (`classifierNode`, „URL
 * context"): die Chips und die getippten Adressen DIESES Turns; nur wenn es
 * keine gibt, die mitgeführten Seiten früherer Turns (#4888). Ein
 * Wolke-Freigabe-Link fällt heraus, er liefert beim Crawlen nur die SPA-Hülle
 * (`cloud_files` liest ihn). Die getippte Adresse gehört dazu, seit
 * „Schreib einen Tweet zu <url>" im Loop läuft (#5456): der Einzeldurchlauf
 * las sie über `scrape_url` vorab, und ob der Planer sie liest, war Glück.
 */
export function attachedPageUrls(state: ChatGraphState): string[] {
  if (state.enabledTools?.['scrape'] === false) return [];
  const own = [
    ...(state.attachedWebpageUrls ?? []),
    ...crawlableUrls(state.lastUserTextNoMentions ?? ''),
  ].filter((url) => !isCloudShareUrl(url));
  if (own.length > 0) return [...new Set(own)].slice(0, MAX_NAMED_PAGES);
  const carried = (state.carriedWebpageUrls ?? []).filter((url) => !isCloudShareUrl(url));
  return [...new Set(carried)].slice(0, MAX_NAMED_PAGES);
}

/**
 * Darf dieser Turn benannte Seiten aus dem Netz lesen? Die EINE Antwort für
 * `scrape_url` (Montage in `toolCatalog`) und das Einlesen als Dokument
 * (`namedPageDocuments`) — liefen sie getrennt, könnte ein Weg ins Netz gehen,
 * den der andere verschlossen hat. Zu: der Agent hat kein Web, oder der Satz
 * verbietet neue Recherche („ohne neue Recherche").
 */
export function canReadNamedPages(
  agentConfig: Parameters<typeof agentAllowsWebSearch>[0],
  state: Pick<ChatGraphState, 'lastUserTextNoMentions' | 'messages'>
): boolean {
  if (!agentAllowsWebSearch(agentConfig)) return false;
  return !forbidsNewResearch(state.lastUserTextNoMentions ?? lastUserText(state));
}
