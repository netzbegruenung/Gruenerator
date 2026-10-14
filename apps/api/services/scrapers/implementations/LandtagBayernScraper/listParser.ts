/**
 * Liest eine Trefferseite der Dokumentensuche des Bayerischen Landtags
 * (`/parlament/dokumente/drucksachen?dokumentenart=…`). Ein Treffer ist ein
 * Vorgang mit seinem Dokument — dasselbe PDF steht deshalb mehrfach in der
 * Liste, wenn es mehrere Vorgänge betrifft (Sammel-Beschlussempfehlungen zum
 * Haushalt, Protokollauszüge über mehrere Anträge). Zusammengefasst wird im
 * Scraper, nicht hier. Reine Funktion, damit `listParser.vitest.ts` sie gegen
 * gespeicherte Seiten prüft.
 */

import * as cheerio from 'cheerio';
import { type AnyNode } from 'domhandler';

export interface BayernListEntry {
  /** „Drucksache" | „Plenarprotokoll" */
  documentKind: string;
  /** z. B. `19/13869`, bei Protokollen die Sitzung `19/87` */
  documentNumber: string;
  /** ISO-Datum (`YYYY-MM-DD`) */
  publishedAt: string | null;
  /** Zeile unter dem Link, z. B. „Antrag CSU, FREIE WÄHLER" oder „Beratungsphase zu Antrag SPD DRS 19/123". */
  descriptor: string;
  title: string;
  /** Kurzbeschreibung des Vorgangs unter dem Titel. */
  abstract: string | null;
  /** Absoluter Link auf das PDF; bei Protokollen der Auszug zum Tagesordnungspunkt. */
  pdfUrl: string;
  /** Vorgangs-Id des Landtags (`gegenstandid`). */
  gegenstandId: string | null;
  schlagworte: string[];
}

export interface BayernListPage {
  /** Trefferzahl aus „Treffer 1 - 100 von 21202", `null`, wenn die Seite keine nennt. */
  total: number | null;
  entries: BayernListEntry[];
}

const BASE_URL = 'https://www.bayern.landtag.de';

const squash = (s: string): string => s.replace(/\s+/g, ' ').trim();

function toIsoDate(text: string): string | null {
  const m = /(\d{2})\.(\d{2})\.(\d{4})/.exec(text);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function parseEntry(
  $: cheerio.CheerioAPI,
  result: cheerio.Cheerio<AnyNode>
): BayernListEntry | null {
  const link = result.find('h4 a').first();
  const href = link.attr('href');
  if (!href) return null;

  // „Drucksache Nr. 19/13869 vom 07.10.2026", „Plenarprotokoll Nr. 19/87 PL vom 23.07.2026"
  const label = squash(link.text());
  const labelMatch = /^(.+?)\s+Nr\.\s+(\d+\/\d+)/.exec(label);

  const col = result.find('h4').first().parent();
  const paragraphs = col.children('p').toArray();
  const h5 = col.children('h5').first();
  const descriptor = paragraphs.find((p) => $(p).index() < h5.index());
  const abstract = paragraphs.find(
    (p) => $(p).index() > h5.index() && $(p).find('a.link-with-icon').length === 0
  );
  const gegenstandHref = result.find('a[href*="gegenstandid="]').first().attr('href') ?? '';

  return {
    documentKind: labelMatch?.[1] ?? label,
    documentNumber: labelMatch?.[2] ?? '',
    publishedAt: toIsoDate(label),
    descriptor: descriptor ? squash($(descriptor).text()) : '',
    title: squash(h5.text()),
    abstract: abstract ? squash($(abstract).text()) || null : null,
    pdfUrl: new URL(href, BASE_URL).toString(),
    gegenstandId: /gegenstandid=(\d+)/.exec(gegenstandHref)?.[1] ?? null,
    schlagworte: [
      ...new Set(
        result
          .find('.schlagworte a.link')
          .toArray()
          .map((a) => squash($(a).text()))
          .filter((s) => s.length > 0)
      ),
    ],
  };
}

export function parseListPage(html: string): BayernListPage {
  const $ = cheerio.load(html);
  const counter = /Treffer\s+\d+\s*-\s*\d+\s+von\s+(\d+)/.exec($('.treffer-info').first().text());
  const entries = $('.row.result')
    .toArray()
    .map((el) => parseEntry($, $(el)))
    .filter((e): e is BayernListEntry => e !== null);
  return { total: counter ? Number(counter[1]) : null, entries };
}
