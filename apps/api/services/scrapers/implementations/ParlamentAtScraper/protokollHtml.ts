/**
 * Stenographisches Protokoll des Nationalrats (HTML) → einzelne Wortmeldungen.
 *
 * Es gibt zwei Formate, und beide markieren Sprecherwechsel ausdrücklich — ein
 * Textparser wie beim Bundestag (`BundestagDipScraper/protokollParser.ts`) ist
 * nicht nötig:
 *
 * - **Ab der XXVIII. GP**: jede Wortmeldung beginnt mit
 *   `<p class="randnummer" id="32" title="Leonore Gewessler (Grüne)">`. Das
 *   Inhaltsverzeichnis nennt je Randnummer die Art (`p` pro, `c` contra,
 *   `rb` Regierungsmitglied …; die Legende steht im Protokoll selbst).
 * - **Bis zur XXVII. GP** (Word-Export): der fette Kopf jedes Sprecherwechsels
 *   trägt einen versteckten Kommentar (`<span style='display:none'><!--¬--></span>`),
 *   auch beim Präsidium. Eine Art steht dort nicht.
 *
 * In beiden stehen Zwischenrufe und Beifall als `<i>(…)</i>`, Tagesordnungs-
 * überschriften als `p.ZM` bzw. `p._ZM`. Wortmeldungen des Präsidiums fallen
 * heraus — sie sind Sitzungsleitung, kein Inhalt.
 */
import * as cheerio from 'cheerio';
import { type AnyNode, type Element } from 'domhandler';

import { collapseTextNodeWhitespace, normalizeStructuredText } from '../../utils/htmlCleaner.js';

import { normalizeParty } from './factions.js';

export type SpeechRole =
  | 'pro'
  | 'contra'
  | 'wortmeldung'
  | 'regierungsbank'
  | 'regierungserklaerung'
  | 'stellungnahme'
  | 'berichtigung'
  | 'begruendung';

const ROLE_CODES: Record<string, SpeechRole> = {
  p: 'pro',
  c: 'contra',
  wm: 'wortmeldung',
  rb: 'regierungsbank',
  er: 'regierungserklaerung',
  sr: 'stellungnahme',
  tb: 'berichtigung',
  bg: 'begruendung',
};

export interface ParsedSpeech {
  /** Sprungmarke im Protokoll-HTML (Randnummer bzw. Word-Anker), sonst `null`. */
  anchor: string | null;
  speaker: string;
  party: string | null;
  personId: string | null;
  isGovernment: boolean;
  role: SpeechRole;
  /** Letzte Tagesordnungsüberschrift vor der Wortmeldung. */
  agenda: string | null;
  text: string;
}

const MIN_SPEECH_CHARS = 50;
const HEAD_MAX_CHARS = 300;
const GOVERNMENT =
  /^(?:Vize|Bundes)kanzler(?:in)?\b|^Bundesminister(?:in)?\b|^Staatssekretär(?:in)?\b/;
const PRESIDIUM =
  /^(?:Erste[r]?\s+|Zweite[r]?\s+|Dritte[r]?\s+|Vize)?Präsident(?:in)?\b|^Schriftführer/;

export function parseProtokoll(html: string): ParsedSpeech[] {
  const $ = cheerio.load(html);
  collapseTextNodeWhitespace($);
  const speeches = $('p.randnummer').length > 0 ? parseRandnummern($) : parseWordExport($);
  return speeches.filter((s) => s.text.length >= MIN_SPEECH_CHARS);
}

function parseRandnummern($: cheerio.CheerioAPI): ParsedSpeech[] {
  const roles = new Map<string, SpeechRole>();
  $('div.inhaltsverzeichnis-verweis').each((_, el) => {
    const code = /\|\s*(\w+)\s*\|/.exec($(el).find('p').first().text())?.[1];
    const rn = $(el).find('a[href^="#"]').last().attr('href')?.slice(1);
    if (code && rn && ROLE_CODES[code]) roles.set(rn, ROLE_CODES[code]);
  });

  const speeches: ParsedSpeech[] = [];
  $('p.randnummer').each((_, el) => {
    const rn = $(el).attr('id') ?? null;
    const who = parseRandnummerTitle($(el).attr('title') ?? '');
    if (!who) return;
    const paragraphs = $(el)
      .nextUntil('p.randnummer, p._ZM')
      .filter('p')
      .not('._RB, ._RE')
      .toArray();
    const personHref = $(paragraphs[0]).find('a[href*="/person/"]').first().attr('href') ?? '';
    speeches.push({
      anchor: rn,
      speaker: who.speaker,
      party: who.party,
      personId: /\/person\/(\d+)/.exec(personHref)?.[1] ?? null,
      isGovernment: who.isGovernment,
      role: (rn && roles.get(rn)) || (who.isGovernment ? 'regierungsbank' : 'wortmeldung'),
      agenda: agendaOf(textOf($, $(el).prevAll('p._ZM').first())),
      text: speechText($, paragraphs),
    });
  });
  return speeches;
}

/** „Leonore Gewessler (Grüne)" bzw. „Christian Stocker, Bundeskanzler"; sonst Sitzungsleitung. */
function parseRandnummerTitle(
  title: string
): { speaker: string; party: string | null; isGovernment: boolean } | null {
  const member = /^(.+?)\s*\(([^)]+)\)$/.exec(title.trim());
  if (member) {
    const party = normalizeParty(member[2]);
    return party ? { speaker: member[1], party, isGovernment: false } : null;
  }
  const official = /^([^,]+),\s*(.+)$/.exec(title.trim());
  if (official && GOVERNMENT.test(official[2])) {
    return { speaker: official[1], party: null, isGovernment: true };
  }
  return null;
}

function parseWordExport($: cheerio.CheerioAPI): ParsedSpeech[] {
  $('span.threecol, hr, a[name^="Seite_"]').remove();
  const speeches: ParsedSpeech[] = [];
  let agenda: string | null = null;
  let current: { head: WordHead | null; paragraphs: Element[] } | null = null;
  const close = () => {
    const head = current?.head;
    if (head && current) {
      const text = speechText($, current.paragraphs);
      // „(fortsetzend)": dieselbe Rede nach einer Unterbrechung durch das Präsidium.
      const previous = speeches.at(-1);
      if (head.continued && previous?.speaker === head.speaker) {
        previous.text = `${previous.text}\n\n${text}`;
      } else {
        const { continued: _continued, ...speech } = head;
        speeches.push({ ...speech, agenda, text });
      }
    }
    current = null;
  };

  for (const p of $('p').toArray()) {
    const cls = $(p).attr('class') ?? '';
    if (cls === 'ZM') {
      close();
      agenda = agendaOf(textOf($, $(p))) ?? agenda;
      continue;
    }
    if (cls === 'RB' || cls === 'RE') continue;
    if (hasSpeakerMarker(p)) {
      close();
      current = { head: parseWordHead($, p), paragraphs: [p] };
      continue;
    }
    current?.paragraphs.push(p);
  }
  close();
  return speeches;
}

/** Der versteckte Ein-Zeichen-Kommentar im Kopf eines Sprecherwechsels. */
function hasSpeakerMarker(node: AnyNode): boolean {
  if (node.type === 'comment') return node.data.trim().length <= 2;
  return 'children' in node && node.children.some(hasSpeakerMarker);
}

type WordHead = Omit<ParsedSpeech, 'text' | 'agenda'> & { continued: boolean };

function parseWordHead($: cheerio.CheerioAPI, p: Element): WordHead | null {
  const full = textOf($, $(p));
  const colon = full.indexOf(':');
  const head = colon >= 0 && colon < HEAD_MAX_CHARS ? full.slice(0, colon) : full;
  if (PRESIDIUM.test(head)) return null;
  const link = $(p).find('a[href*="PAD_"]').first();
  const speaker =
    textOf($, link) || head.replace(/^Abgeordnete[r]?\s+/, '').replace(/\s*\(.*$/, '');
  const isGovernment = GOVERNMENT.test(head);
  const party = [...head.matchAll(/\(([^)]+)\)/g)]
    .map((m) => normalizeParty(m[1]))
    .find((value) => value !== null);
  return {
    anchor: $(p).find('a[name^="R_"]').first().attr('name') ?? null,
    speaker: speaker.replace(/,$/, '').trim(),
    party: isGovernment ? null : (party ?? null),
    personId: /PAD_0*(\d+)/.exec(link.attr('href') ?? '')?.[1] ?? null,
    isGovernment,
    role: isGovernment ? 'regierungsbank' : 'wortmeldung',
    continued: /\(fortsetzend\)/i.test(head),
  };
}

/**
 * Absätze als Absätze — innerhalb eines Absatzes ist ein Zeilenumbruch im
 * HTML-Quelltext nur Umbruch, zwischen Absätzen bleibt die Leerzeile stehen.
 * Der Kopf („Abgeordnete … (Grüne):") fällt weg; er steht im Titel. Er wird
 * abgeschnitten, BEVOR die Einschübe fallen: „(fortsetzend)" steht selbst in
 * `<i>`, und ohne ihn fände der Schnitt den Doppelpunkt hinter dem Kopf nicht.
 */
function speechText($: cheerio.CheerioAPI, paragraphs: readonly Element[]): string {
  const parts: string[] = [];
  paragraphs.forEach((p, i) => {
    const clone = $(p).clone();
    clone.find('span[style*="display:none"]').remove();
    const interjections = clone
      .find('i')
      .toArray()
      .map((el) => textOf($, $(el)))
      .filter((t) => t.startsWith('('));
    let text = textOf($, clone);
    if (i === 0) {
      const colon = text.indexOf(':');
      if (colon >= 0 && colon < HEAD_MAX_CHARS) text = text.slice(colon + 1);
    }
    for (const interjection of interjections) text = text.replace(interjection, '');
    text = text.replace(/ {2,}/g, ' ').trim();
    if (!text) return;
    // Ein Seitenumbruch im Word-Export zerschneidet den Absatz; was ohne
    // Satzende aufhört, geht im nächsten weiter.
    const previous = parts.at(-1);
    if (previous !== undefined && !/[.!?:;)"“”–]$/.test(previous)) {
      parts[parts.length - 1] = `${previous} ${text}`;
    } else {
      parts.push(text);
    }
  });
  return normalizeStructuredText(parts.join('\n\n'));
}

/** Zwischenüberschriften wie „*****" sind Trenner, kein Tagesordnungspunkt. */
function agendaOf(text: string): string | null {
  return /\p{L}/u.test(text) ? text : null;
}

function textOf($: cheerio.CheerioAPI, el: cheerio.Cheerio<AnyNode>): string {
  return el
    .text()
    .replace(/\u00AD/g, '')
    .replace(/ {2,}/g, ' ')
    .trim();
}
