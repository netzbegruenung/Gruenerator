/**
 * Was nur die HTML-Seite eines Antrags verrät, nicht die REST-API.
 *
 * Am 15.11.2026 an gruene-nrw.antragsgruen.de gemessen:
 *   - `date_published` ist bei vielen Änderungsanträgen und Beschlüssen `null`
 *     (LDK Troisdorf: 140 von 158 Dokumenten). Die Seite nennt trotzdem
 *     „Eingereicht: 04.06.2026, 12:29".
 *   - Ein Beschluss nennt „Beschluss durch" und „Beschlossen am"; die API hat
 *     beides nicht.
 *   - Die „Antragshistorie" verknüpft die Versionen eines Antrags: der
 *     eingereichte Antrag ist Version 1, der Beschluss eine spätere Version mit
 *     eigener Antrags-ID. Bei V-07 standen dort drei Versionen, zwei davon mit
 *     Status „Beschluss" und demselben Text, aber verschiedenem „Beschlossen am"
 *     (29.06. für einen Zwischenstand, 21.06. für die endgültige Fassung).
 *
 * Gelesen wird ausschliesslich die Datentabelle (`table.motionDataTable`). Fehlt
 * eine Zeile, bleibt das Feld leer — eine Seite ohne Tabelle macht keinen Lauf
 * kaputt, sie liefert nur weniger.
 */

import * as cheerio from 'cheerio';
import { type Element } from 'domhandler';

import { numberedSectionsOf, type NumberedSection } from './lineNumbers.js';

export interface PageFacts {
  /** ISO-Datum (`YYYY-MM-DD`) aus „Eingereicht". */
  eingereichtAm: string | null;
  /** ISO-Datum aus „Beschlossen am". */
  beschlossenAm: string | null;
  /**
   * „Beschluss durch", nur wenn dort ein Gremium steht. Am 16.11.2026 stand bei
   * V-01 des Landesparteirats Schwerte ein Personenname — als beschließendes
   * Organ gelesen, wäre das falsch.
   */
  beschlussDurch: string | null;
  /** ISO-Datum der „Veranstaltung", nur wenn sie an genau einem Tag war. */
  veranstaltungAm: string | null;
  /** Versionsnummer dieser Seite in der Antragshistorie; null ohne Historie. */
  version: number | null;
  /** Die anderen Versionen derselben Kette, mit ihrer Antrags-ID. */
  otherVersions: Array<{ version: number; motionId: number }>;
  /** Abschnitte mit Zeilennummern (`lineNumbers.ts`); leer, wenn die Seite keine zeigt. */
  numbered: NumberedSection[];
}

const EMPTY: PageFacts = {
  eingereichtAm: null,
  beschlossenAm: null,
  beschlussDurch: null,
  veranstaltungAm: null,
  version: null,
  otherVersions: [],
  numbered: [],
};

/** „04.06.2026, 12:29" bzw. „21.06.2026" → „2026-06-04" */
export function germanDateToIso(text: string | null | undefined): string | null {
  const m = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(text ?? '');
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

const MONTHS: Record<string, string> = {
  januar: '01',
  februar: '02',
  märz: '03',
  maerz: '03',
  april: '04',
  mai: '05',
  juni: '06',
  juli: '07',
  august: '08',
  september: '09',
  oktober: '10',
  november: '11',
  dezember: '12',
};

/**
 * Ein Datum in Fließtext: „am 21. Juni 2026", „vom 3 . September 2026",
 * „am 16.11. 2025", „15.02.2020" → ISO-Datum.
 */
export function germanTextDateToIso(text: string): string | null {
  const t = text.replace(/\s*\.\s*/g, '. ');
  const numeric = /(\d{1,2})\. (\d{1,2})\. ?(\d{4})/.exec(t);
  if (numeric) return germanDateToIso(`${numeric[1]}.${numeric[2]}.${numeric[3]}`);
  const named = /(\d{1,2})\. ([A-Za-zÄÖÜäöü]+) (\d{4})/.exec(t);
  const month = named ? MONTHS[named[2].toLowerCase()] : null;
  return named && month ? `${named[3]}-${month}-${named[1].padStart(2, '0')}` : null;
}

/** Nur eine eintägige Veranstaltung liefert ein Beschlussdatum — „20./21. Juni" oder „13.-15. November" nicht. */
export function singleEventDateOf(text: string | null): string | null {
  if (!text || /\d{1,2}\.\s*[-–/]\s*\d{1,2}\./.test(text)) return null;
  return germanTextDateToIso(text);
}

const GREMIUM = /konferenz|rat\b|vorstand|versammlung|kommission|präsidium|parteitag/i;

const versionNumber = (text: string): number | null => {
  const m = /Version\s+(\d+)/.exec(text);
  return m ? Number(m[1]) : null;
};

export function pageFactsOf(html: string): PageFacts {
  const $ = cheerio.load(html);
  const table = $('table.motionDataTable').first();
  if (table.length === 0) return { ...EMPTY, numbered: numberedSectionsOf(html) };

  const rows = new Map<string, Element>();
  table.find('tr').each((_, tr) => {
    const label = $(tr).find('th').first().text().replace(/:\s*$/, '').trim();
    const cell = $(tr).find('td').get(0);
    if (label && cell) rows.set(label, cell);
  });
  const text = (label: string): string | null => {
    const cell = rows.get(label);
    const value = cell ? $(cell).text().replace(/\s+/g, ' ').trim() : '';
    return value ? value : null;
  };

  // Nur der ausgeklappte Teil der Historie: der Öffner darunter wiederholt die
  // aktuelle Version und hätte sie doppelt gezählt.
  const historyCell = rows.get('Antragshistorie');
  const history = historyCell ? $(historyCell).find('.fullHistory') : null;
  let version: number | null = null;
  const otherVersions: PageFacts['otherVersions'] = [];
  history?.find('.historyLine').each((_, line) => {
    const node = $(line);
    if (node.hasClass('currentVersion')) {
      version = versionNumber(node.find('.currVersion').text());
      return;
    }
    const link = node.find('a').first();
    const id = /motion(\d+)/.exec(link.attr('class') ?? '')?.[1];
    const n = versionNumber(link.text());
    if (id && n !== null) otherVersions.push({ version: n, motionId: Number(id) });
  });

  return {
    eingereichtAm: germanDateToIso(text('Eingereicht')),
    beschlossenAm: germanDateToIso(text('Beschlossen am')),
    beschlussDurch: GREMIUM.test(text('Beschluss durch') ?? '') ? text('Beschluss durch') : null,
    veranstaltungAm: singleEventDateOf(text('Veranstaltung')),
    version,
    otherVersions,
    numbered: numberedSectionsOf(html),
  };
}

/**
 * Die Rolle einer Version in ihrer Kette.
 *   - `current`: die neueste Version — oder ein Antrag ohne Historie.
 *   - `original`: Version 1 einer Kette mit neuerer Fassung. Bleibt im Index,
 *     als eingereichte Fassung mit Verweis auf die neueste.
 *   - `superseded`: eine Zwischenversion. Wird nicht geschrieben: sie ist
 *     entweder textgleich mit der neuesten (V-07) oder ein überholter
 *     Zwischenstand, und beides liest sich in einer Antwort wie eine eigene Quelle.
 */
export type VersionRole =
  | { role: 'current' }
  | { role: 'original'; newestMotionId: number }
  | { role: 'superseded'; newestMotionId: number };

export function versionRoleOf(facts: Pick<PageFacts, 'version' | 'otherVersions'>): VersionRole {
  if (facts.version === null || facts.otherVersions.length === 0) return { role: 'current' };
  const newest = facts.otherVersions.reduce((a, b) => (b.version > a.version ? b : a));
  if (newest.version < facts.version) return { role: 'current' };
  return facts.version === 1
    ? { role: 'original', newestMotionId: newest.motionId }
    : { role: 'superseded', newestMotionId: newest.motionId };
}
