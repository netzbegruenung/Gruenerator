/**
 * Redensuche für das Chat-Werkzeug `bundestag_reden`: „Wann hat Katrin Uhlig
 * über Wärmeplanung gesprochen?" — die semantische Suche des Bundestag-MCP über
 * die Plenarprotokolle, mit Redner, Fraktion, Zeitraum und Sortierung.
 *
 * Fraktionen: die Redensammlung des MCP speichert KURZE Namen („GRÜNE"), die
 * DIP-Filter LANGE („Fraktion BÜNDNIS 90/DIE GRÜNEN"). Das Werkzeug nimmt beide
 * und bildet hier auf die kurzen ab.
 */
import { btpProtokollPdfUrl, type BtSpeech } from '@gruenerator/contracts';
import { z } from 'zod';

import { type BtSort, getBundestagMCPClient } from './BundestagMCPClient.js';
import { detectUrheber, detectZeitraum } from './qa/planDetect.js';

/** Kurze Namen der Redensammlung (MCP `speakerParty`). */
export const REDEN_PARTEIEN = [
  'CDU/CSU',
  'SPD',
  'GRÜNE',
  'AfD',
  'DIE LINKE',
  'FDP',
  'BSW',
] as const;
export type RedenPartei = (typeof REDEN_PARTEIEN)[number];

/** Was das Modell als `fraktion` schicken darf: kurz, lang (wie bei `bundestag`) oder umgangssprachlich. */
export const redenFraktionSchema = z.enum([
  ...REDEN_PARTEIEN,
  'Fraktion BÜNDNIS 90/DIE GRÜNEN',
  'BÜNDNIS 90/DIE GRÜNEN',
  'Grüne',
  'Fraktion der CDU/CSU',
  'Union',
  'Fraktion der SPD',
  'Fraktion der AfD',
  'Fraktion DIE LINKE',
  'Linke',
  'Fraktion der FDP',
]);
export type RedenFraktion = z.infer<typeof redenFraktionSchema>;

/** Vollständig über alle Nicht-Kurznamen: ein neuer Wert im Schema bricht hier den Typcheck. */
const LANG_ZU_KURZ: Record<Exclude<RedenFraktion, RedenPartei>, RedenPartei> = {
  'Fraktion BÜNDNIS 90/DIE GRÜNEN': 'GRÜNE',
  'BÜNDNIS 90/DIE GRÜNEN': 'GRÜNE',
  Grüne: 'GRÜNE',
  'Fraktion der CDU/CSU': 'CDU/CSU',
  Union: 'CDU/CSU',
  'Fraktion der SPD': 'SPD',
  'Fraktion der AfD': 'AfD',
  'Fraktion DIE LINKE': 'DIE LINKE',
  Linke: 'DIE LINKE',
  'Fraktion der FDP': 'FDP',
};

function isPartei(f: RedenFraktion): f is RedenPartei {
  return (REDEN_PARTEIEN as readonly string[]).includes(f);
}

export const redenSortierungSchema = z.enum(['relevanz', 'neueste', 'aelteste']);
export type RedenSortierung = z.infer<typeof redenSortierungSchema>;

const SORT: Record<RedenSortierung, BtSort> = {
  relevanz: 'relevance',
  neueste: 'newest',
  aelteste: 'oldest',
};

export function redenPartei(fraktion: RedenFraktion): RedenPartei {
  return isPartei(fraktion) ? fraktion : LANG_ZU_KURZ[fraktion];
}

export interface RedenFilter {
  redner?: string;
  fraktion?: RedenFraktion;
  wahlperiode?: number;
  datumVon?: string;
  datumBis?: string;
  sortierung?: RedenSortierung;
}

const NEUESTE_RE =
  /\b(?:zuletzt|neueste[nrs]?|jüngst\w*|aktuellste[nrs]?|letzte[nrs]?\s+(?:mal|rede))\b/i;
const AELTESTE_RE = /\b(?:erstmals|zum\s+ersten\s+mal|früheste[nrs]?|älteste[nrs]?)\b/i;

/**
 * Was der Wortlaut der Nachricht an Filtern hergibt: Zeitraum, Sortierung und
 * — nur ohne Redner — genau eine Fraktion. Mit Redner ist die Fraktion
 * überflüssig und gefährlich: „Was hat Uhlig der Union erwidert?" nennt die
 * Union, ohne dass Uhlig in ihr säße.
 */
export function redenFilterFromWording(text: string, hasRedner: boolean): RedenFilter {
  const out: RedenFilter = { ...detectZeitraum(text) };
  if (NEUESTE_RE.test(text)) out.sortierung = 'neueste';
  else if (AELTESTE_RE.test(text)) out.sortierung = 'aelteste';
  if (!hasRedner) {
    const parteien = detectUrheber(text).filter((u) => u !== 'Bundesregierung');
    const only = parteien.length === 1 ? parteien[0] : null;
    const parsed = only ? redenFraktionSchema.safeParse(only) : null;
    if (parsed?.success) out.fraktion = parsed.data;
  }
  return out;
}

export interface RedenSuche extends RedenFilter {
  thema: string;
  limit?: number;
  /**
   * Wörtliche Phrase statt Bedeutungssuche: `thema` ist dann die Phrase. Der MCP
   * filtert `requiredKeywords` (die Einzelwörter) hart auf dem Redetext, aber erst
   * NACH der semantischen Suche; wir holen deshalb die Höchstzahl Kandidaten und
   * prüfen die Phrase am Redetext selbst nach. Nicht erschöpfend.
   */
  wortlaut?: boolean;
}

export interface RedenErgebnis {
  speeches: BtSpeech[];
  /** Keine Treffer in der aktuellen Wahlperiode, daher über alle gesucht. */
  wpFallback: boolean;
}

/** Kandidaten, die die Wortlautsuche beim MCP anfordert (Höchstwert des Werkzeugs). */
const WORTLAUT_CANDIDATES = 50;

function normalizePhrase(text: string): string {
  return text
    .replace(/[„“”"«»‚‘’']/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

/**
 * `requiredKeywords` des MCP prüft ein Wort als Teilstring, eine Phrase mit
 * Leerzeichen trifft nie (gemessen 28.10.2026: „mit Leben füllt" → 0 Treffer, die
 * Einzelwörter → 5). Deshalb gehen die Wörter einzeln hinein; die Phrase prüft
 * `containsPhrase` danach am Redetext.
 */
export function phraseKeywords(phrase: string): string[] {
  const words = normalizePhrase(phrase)
    .split(' ')
    .filter((w) => w.length >= 3);
  return words.length > 0 ? [...new Set(words)] : [phrase];
}

/** Kommt die Phrase wörtlich (ohne Rücksicht auf Groß-/Kleinschreibung, Anführungszeichen, Leerraum) im Text vor? */
export function containsPhrase(text: string, phrase: string): boolean {
  return normalizePhrase(text).includes(normalizePhrase(phrase));
}

/**
 * Redetext je Treffer: das Budget verteilt sich auf die angefragten Reden. Eine
 * einzelne Rede kommt so ganz an (bis 20.000 Zeichen), fünf Reden je 4.800.
 * Bis 10/2026 galt pauschal 4.000 — auch dann, wenn nach genau einer Rede
 * „wörtlich" gefragt war.
 */
const REDEN_TEXT_BUDGET = 24_000;
const REDE_TEXT_MIN = 4_000;
/** Längste Rede, die ganz ankommt; zugleich die Kappe, auf der die Wortlautsuche prüft. */
export const REDE_TEXT_MAX = 20_000;

export function redeTextCap(anzahl: number): number {
  return Math.min(
    REDE_TEXT_MAX,
    Math.max(REDE_TEXT_MIN, Math.floor(REDEN_TEXT_BUDGET / Math.max(anzahl, 1)))
  );
}

/** Kürzt einen schon bereinigten Redetext wie `cleanDipText` (mit „…" am Schnitt). */
function kappeRede(s: BtSpeech, max: number): BtSpeech {
  return s.excerpt.length > max ? { ...s, excerpt: `${s.excerpt.slice(0, max)}…` } : s;
}

/** Die Suchschnittstelle des MCP-Clients, die hier gebraucht wird (Tests reichen einen Stub). */
export interface RedenClient {
  searchSpeechesFull: ReturnType<typeof getBundestagMCPClient>['searchSpeechesFull'];
}

/** Wirft, wenn der MCP nicht erreichbar ist. */
export async function searchBundestagReden(
  suche: RedenSuche,
  client: RedenClient = getBundestagMCPClient()
): Promise<RedenErgebnis> {
  const limit = Math.min(Math.max(suche.limit ?? 5, 1), 10);
  const phrase = suche.wortlaut ? suche.thema.trim() : null;
  const { items, wpFallback } = await client.searchSpeechesFull({
    query: suche.thema,
    ...(phrase ? { requiredKeywords: phraseKeywords(phrase) } : {}),
    ...(suche.redner ? { speaker: suche.redner } : {}),
    ...(suche.fraktion ? { speakerParty: redenPartei(suche.fraktion) } : {}),
    ...(suche.wahlperiode ? { wahlperiode: suche.wahlperiode } : {}),
    ...(suche.datumVon ? { dateFrom: suche.datumVon } : {}),
    ...(suche.datumBis ? { dateTo: suche.datumBis } : {}),
    limit: phrase ? WORTLAUT_CANDIDATES : limit,
    sort: SORT[suche.sortierung ?? 'relevanz'],
    // Die Wortlautsuche prüft die Phrase im Text: auf einem gekappten Text fiele
    // eine Fundstelle hinter der Kappe still durch.
    maxChars: phrase ? REDE_TEXT_MAX : redeTextCap(limit),
  });
  if (!phrase) return { speeches: items, wpFallback };
  const hits = items.filter((s) => containsPhrase(s.excerpt, phrase)).slice(0, limit);
  const cap = redeTextCap(hits.length);
  return { speeches: hits.map((s) => kappeRede(s, cap)), wpFallback };
}

function deDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${d}.${m}.${y}` : iso;
}

/** „Rede Katrin Uhlig (GRÜNE) · Plenarprotokoll 21/8 · 23.05.2025" (+ Tagesordnungspunkt). */
export function redeTitle(s: BtSpeech): string {
  const wer = `Rede ${s.speaker}${s.party ? ` (${s.party})` : ''}`;
  const protokoll = s.protokollNummer
    ? `${s.herausgeber === 'BR' ? 'BR-Plenarprotokoll' : 'Plenarprotokoll'} ${s.protokollNummer}`
    : null;
  return [wer, protokoll, s.date ? deDate(s.date) : null, s.topTitle].filter(Boolean).join(' · ');
}

/** PDF des Plenarprotokolls (nur Bundestag, Muster `btp/21/21008.pdf`), sonst `null`. */
export function redeUrl(s: BtSpeech): string | null {
  return btpProtokollPdfUrl(s.protokollNummer, s.herausgeber);
}

/** Die Filter in Worten für die Karte im Chat, eine Zeile je Filter. */
export function describeRedenFilter(f: RedenFilter): string[] {
  const lines: string[] = [];
  if (f.redner) lines.push(`Redner*in: ${f.redner}`);
  if (f.fraktion) lines.push(`Fraktion: ${redenPartei(f.fraktion)}`);
  if (f.wahlperiode) lines.push(`Wahlperiode: ${f.wahlperiode}`);
  if (f.datumVon && f.datumBis) {
    lines.push(`Zeitraum: ${deDate(f.datumVon)} bis ${deDate(f.datumBis)}`);
  } else if (f.datumVon) {
    lines.push(`Zeitraum: ab ${deDate(f.datumVon)}`);
  } else if (f.datumBis) {
    lines.push(`Zeitraum: bis ${deDate(f.datumBis)}`);
  }
  if (f.sortierung === 'neueste') lines.push('Sortierung: neueste zuerst');
  if (f.sortierung === 'aelteste') lines.push('Sortierung: älteste zuerst');
  return lines;
}
