/**
 * Anträge auf einer eigenen Antragsgrün-Seite lesen — mit Zeilennummern, damit
 * ein Änderungsantrag die Stelle so nennt, wie die Versammlung sie sieht.
 *
 * Gemessen am 18.11.2026 gegen Antragsgrün 4.18.1 (Docker):
 * - `GET /rest/<kons>` listet nur freigeschaltete Anträge, auch für Admins. Ein
 *   eben eingereichter Antrag („Eingereicht (ungeprüft)") fehlt dort. Die Liste
 *   kommt deshalb aus der Antragsliste der Admins (`<kons>/admin/list`, Zeilen
 *   `tr.motion`).
 * - `GET /rest/<kons>/motion/<slug>` liefert mit dem Token auch ungeprüfte Anträge.
 * - Die Zeilennummern stehen nur auf der HTML-Seite: jede Zeile beginnt mit
 *   `span.lineNumber[data-line-number]`. Gelesen wird Zeile für Zeile, nicht je
 *   Absatz wie im NRW-Index (`numberedSectionsOf`) — ein Änderungsantrag nennt
 *   die genaue Zeile, und mit „[Z. 1–4]" für einen Absatz riet das Modell im
 *   Test „Zeile 1" für eine Stelle in Zeile 2.
 * - Änderungsanträge stellt man unter `<antrag>/amendment/create`. Eine API dafür
 *   hat Antragsgrün nicht; der Grünerator kann sie nur entwerfen.
 */
import * as cheerio from 'cheerio';

import { motionSchema } from '../../scrapers/implementations/ParteitageScraper/antragsgruenClient.js';
import { htmlToStructuredText } from '../../scrapers/utils/htmlCleaner.js';
import { FormStepError, type FormClient } from '../../webForms/formClient.js';
import { matchValues, sameKuerzel } from '../resolve.js';

import { tokenOf } from './motions.js';

export interface OwnMotionRef {
  id: number;
  /** Antragsnummer, z. B. „A1"; `null`, solange die Admins keine vergeben haben. */
  prefix: string | null;
  title: string;
  status: string;
  url: string;
}

export interface OwnMotion extends OwnMotionRef {
  /** Abschnitte als Text; zeigt die Seite Zeilennummern, beginnt jede Zeile mit „[Z. n]". */
  sections: { title: string; text: string }[];
  lineNumbers: boolean;
  /** Formular für einen Änderungsantrag zu diesem Antrag. */
  amendmentFormUrl: string;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Die Anträge der Antragsliste für Admins (`views/admin/motion-list`). */
export function motionListOf(html: string, origin: string): OwnMotionRef[] {
  const $ = cheerio.load(html);
  return $('tr.motion')
    .map((_, tr) => {
      const id = Number($(tr).find('input[name="motions[]"]').attr('value'));
      const link = $(tr).find('td.prefixCol a').first();
      const href = link.attr('href');
      if (!Number.isFinite(id) || !href) return null;
      const prefix = clean(link.text());
      // Die Spalte nach dem Titel; ohne den „To Do"-Hinweis darunter.
      const statusCell = $(tr).find('td.titleCol').next('td').clone();
      statusCell.find('.todo').remove();
      return {
        id,
        prefix: prefix && prefix !== '-' ? prefix : null,
        title: clean($(tr).find('td.titleCol').text()),
        status: clean(statusCell.text()),
        url: new URL(href, origin).toString(),
      };
    })
    .get()
    .filter((m): m is OwnMotionRef => m !== null);
}

export async function listOwnMotions(
  client: FormClient,
  origin: string,
  consultation: string
): Promise<OwnMotionRef[]> {
  const res = await client.request(`${origin}/${consultation}/admin/list`);
  if (res.status !== 200 || res.redirected) {
    throw new FormStepError(`Antragsliste nicht lesbar (HTTP ${res.status})`, 'list');
  }
  return motionListOf(res.html, origin);
}

/** Antragsnummer genau („A1" = „a 1"), sonst Titel; mehrere Treffer = keiner. */
export function findOwnMotion(
  motions: readonly OwnMotionRef[],
  wanted: string
): OwnMotionRef | null {
  const byPrefix = motions.filter((m) => m.prefix && sameKuerzel(m.prefix, wanted));
  if (byPrefix.length === 1) return byPrefix[0];
  const titles = matchValues(
    wanted,
    motions.map((m) => m.title)
  );
  const byTitle = motions.filter((m) => titles.includes(m.title));
  return byTitle.length === 1 ? byTitle[0] : null;
}

// Eine sichtbare Marke: `htmlToStructuredText` streicht Steuerzeichen wie \u0000.
const MARK = (n: number) => `⟦Z:${n}⟧`;

/**
 * Die Abschnitte der Seite, Zeile für Zeile mit „[Z. n]". Absätze bleiben durch
 * eine Leerzeile getrennt, Listenpunkte behalten ihr „- ".
 */
export function numberedLinesOf(pageHtml: string): { title: string; text: string }[] {
  const $ = cheerio.load(pageHtml);
  const sections: { title: string; text: string }[] = [];
  $('section.motionTextHolder').each((_, sec) => {
    const paragraphs: string[] = [];
    $(sec)
      .find('div.paragraph.lineNumbers')
      .each((__, p) => {
        const text = $(p).find('div.text').first().clone();
        // Bedienelemente der Seite, kein Antragstext.
        text.find('section.privateParagraphNoteHolder, ul.bookmarks, button').remove();
        text.find('span.lineNumber').each((___, span) => {
          const n = Number($(span).attr('data-line-number'));
          // Der Umbruch vor einer Zeilenmarke ist der weiche Umbruch der Anzeige.
          $(span).prev('br').remove();
          $(span).replaceWith(Number.isFinite(n) ? MARK(n) : '');
        });
        const parts = htmlToStructuredText(text.html() ?? '').split(/⟦Z:(\d+)⟧/);
        // parts = [vor der ersten Marke, n1, Zeile 1, n2, Zeile 2, …]
        const lines: string[] = [];
        for (let i = 1; i < parts.length; i += 2) {
          const line = `${i === 1 ? parts[0] : ''}${parts[i + 1] ?? ''}`
            .replace(/\s+/g, ' ')
            .trim();
          lines.push(`[Z. ${parts[i]}] ${line}`);
        }
        if (lines.length) paragraphs.push(lines.join('\n'));
      });
    if (paragraphs.length) {
      sections.push({
        title: $(sec).find('h2').first().text().trim(),
        text: paragraphs.join('\n\n'),
      });
    }
  });
  return sections;
}

export async function readOwnMotion(
  client: FormClient,
  origin: string,
  consultation: string,
  ref: OwnMotionRef
): Promise<OwnMotion> {
  const slug = new URL(ref.url).pathname.split('/').filter(Boolean).pop() ?? '';
  const token = await tokenOf(client, origin, consultation);
  const json = await client.request(`${origin}/rest/${consultation}/motion/${slug}`, {
    bearer: token,
  });
  let parsed;
  try {
    parsed = motionSchema.safeParse(JSON.parse(json.html));
  } catch {
    parsed = null;
  }
  if (json.status !== 200 || !parsed?.success) {
    throw new FormStepError(`Antrag nicht lesbar (HTTP ${json.status})`, 'read');
  }
  const page = await client.request(ref.url);
  const numbered = page.status === 200 ? numberedLinesOf(page.html) : [];
  let lineNumbers = false;
  const sections = parsed.data.sections
    .filter((s) => s.html && s.type !== 'Title')
    .map((s) => {
      const marked = numbered.find((n) => n.title === s.title.trim());
      if (marked) lineNumbers = true;
      return { title: s.title, text: marked?.text ?? htmlToStructuredText(s.html ?? '') };
    });
  return {
    ...ref,
    title: parsed.data.title,
    status: cheerio.load(parsed.data.status_title).text().trim() || ref.status,
    sections,
    lineNumbers,
    amendmentFormUrl: `${ref.url}/amendment/create`,
  };
}
