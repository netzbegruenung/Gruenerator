/**
 * Liest eine Trefferseite der Parlamentsdatenbank des Landtags NRW
 * (`parlamentsdatenbank-suchergebnis.html?view=detail`). Jeder Treffer trägt
 * bereits alles, was das Notebook als Filter braucht — Systematik, Schlagworte,
 * Redner*innen, Beschluss —, gepflegt von der Landtagsdokumentation. Reine
 * Funktion, damit `listParser.vitest.ts` sie gegen gespeicherte Seiten prüft.
 */

import * as cheerio from 'cheerio';
import { type AnyNode } from 'domhandler';

export interface PageRange {
  from: number;
  /** 0 heißt „bis zum Ende" — so verlinkt der Landtag ganze Drucksachen. */
  to: number;
}

export interface LandtagListEntry {
  /** Datenbank-Id des Treffers, z. B. `1814959/0700` — stabil, eindeutig je Tagesordnungspunkt. */
  recordId: string;
  title: string;
  /** Zeile zwischen Titel und Dokument-Link, z. B. „Antwort MUNV zu KlAnfr 6961 Drs 18/20669". */
  descriptor: string;
  /** „Drucksache" | „Plenarprotokoll" | „Ausschussprotokoll" | … */
  documentKind: string;
  /** z. B. `18/21508` */
  documentNumber: string;
  /** Text hinter dem Link: Datum, Seiten, bei Ausschüssen Sitzung und Kürzel. */
  trailer: string;
  /** ISO-Datum (`YYYY-MM-DD`) aus dem Trailer. */
  publishedAt: string | null;
  /** Absoluter Link auf das PDF; bei Protokollen nur die Seiten dieses Punkts. */
  pdfUrl: string;
  pageRanges: PageRange[];
  abstract: string | null;
  beschluss: string | null;
  systematik: string[];
  schlagworte: string[];
  redner: string[];
}

export interface LandtagListPage {
  /** Trefferzahl aus „1 bis 50 von 21910", `null`, wenn die Seite keine nennt. */
  total: number | null;
  entries: LandtagListEntry[];
}

const BASE_URL = 'https://www.landtag.nrw.de';

const squash = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** HTML-Fragment → Text, `<br>` als Zeilenumbruch. */
function fragmentText(html: string): string {
  return cheerio
    .load(`<div>${html.replace(/<br\s*\/?>/gi, '\n')}</div>`)('div')
    .text()
    .split('\n')
    .map(squash)
    .join('\n')
    .trim();
}

function toIsoDate(text: string): string | null {
  const m = /(\d{2})\.(\d{2})\.(\d{4})/.exec(text);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function parsePageRanges(checkboxValue: string): PageRange[] {
  return [...checkboxValue.matchAll(/Id=[^|&]+\|(\d+)\|(\d+)/g)].map((m) => ({
    from: Number(m[1]),
    to: Number(m[2]),
  }));
}

const splitStarList = (line: string | undefined): string[] =>
  line
    ? line
        .split('*')
        .map(squash)
        .filter((s) => s.length > 0)
    : [];

const FIELD_START = /^(Beschluss|Systematik|Schlagworte|Redner):/;

/** Der aufklappbare „Details"-Teil: Inhaltsangabe, Beschluss, Systematik, Schlagworte, Redner. */
function parseDetails(
  text: string
): Pick<LandtagListEntry, 'abstract' | 'beschluss' | 'systematik' | 'schlagworte' | 'redner'> {
  const lines = text.split('\n');
  const firstField = lines.findIndex((l) => FIELD_START.test(l));
  const abstractLines = firstField === -1 ? lines : lines.slice(0, firstField);
  const abstract = squash(abstractLines.join(' '));

  const field = (name: string): string | undefined =>
    lines
      .find((l) => l.startsWith(`${name}:`))
      ?.slice(name.length + 1)
      .trim();

  const rednerStart = lines.findIndex((l) => l.startsWith('Redner:'));
  const redner =
    rednerStart === -1
      ? []
      : [lines[rednerStart].slice('Redner:'.length), ...lines.slice(rednerStart + 1)]
          .map(squash)
          .filter((l) => l.length > 0 && !FIELD_START.test(l));

  return {
    abstract: abstract.length > 0 ? abstract : null,
    beschluss: field('Beschluss') ?? null,
    systematik: splitStarList(field('Systematik')),
    schlagworte: splitStarList(field('Schlagworte')),
    redner,
  };
}

function parseEntry(
  $: cheerio.CheerioAPI,
  article: cheerio.Cheerio<AnyNode>
): LandtagListEntry | null {
  const articleHtml = $.html(article);
  const recordId = /<!--\s*Id:\s*(\S+)\s*-->/.exec(articleHtml)?.[1];
  const bodyP = article.find('.e-search-result__body p').first();
  const link = bodyP.find('a[href*="dokumentenarchiv"]').first();
  const href = link.attr('href');
  if (!recordId || !href) return null;

  const bodyHtml = bodyP.html() ?? '';
  const linkStart = bodyHtml.indexOf('<a');
  const linkEnd = bodyHtml.indexOf('</a>', linkStart);
  const beforeLink = bodyHtml.slice(0, linkStart).replace(/<strong>[\s\S]*?<\/strong>/, '');

  const label = squash(link.text());
  const labelMatch = /^(.+?)\s+(\d+\/\d+)$/.exec(label);
  const trailer = squash(fragmentText(bodyHtml.slice(linkEnd + 4)).replace(/\n/g, ' '));

  return {
    recordId,
    title: squash(bodyP.find('b').first().text()),
    descriptor: squash(fragmentText(beforeLink).replace(/\n/g, ' ')),
    documentKind: labelMatch?.[1] ?? label,
    documentNumber: labelMatch?.[2] ?? '',
    trailer,
    publishedAt: toIsoDate(trailer),
    pdfUrl: new URL(href, BASE_URL).toString(),
    pageRanges: parsePageRanges(article.find('input[type="checkbox"]').first().attr('value') ?? ''),
    ...parseDetails(fragmentText(article.find('.e-accordion-item__content-body').html() ?? '')),
  };
}

export function parseListPage(html: string): LandtagListPage {
  const $ = cheerio.load(html);
  const counter = /von\s+(\d+)/.exec($('[data-js-details]').first().text());
  const entries = $('article.e-search-result')
    .toArray()
    .map((el) => parseEntry($, $(el)))
    .filter((e): e is LandtagListEntry => e !== null);
  return { total: counter ? Number(counter[1]) : null, entries };
}
