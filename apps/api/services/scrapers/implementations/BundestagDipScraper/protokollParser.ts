/**
 * Reden aus dem Volltext eines Plenarprotokolls (DIP `plenarprotokoll-text`).
 *
 * Port des Python-Parsers aus Bundestag Wrapped (`noun_analysis/parser.py`),
 * der den importierten Bestand erzeugt hat — nicht des JS-Rückfalls im
 * MCP-Indexer, der Minister*innen mit Titel und Staatssekretär*innen verliert.
 * Grundidee aus Open Discourse: jede Sprecher*innen-Zeile ist eine Grenze, der
 * Text bis zur nächsten Grenze gehört zu ihr. Präsidiumszeilen sind nur Grenzen,
 * ihr Text wird verworfen. Klammerinhalte (Beifall, Zwischenrufe) gehören nicht
 * zur Rede und fallen weg.
 */
import { normalizeParty, partyForOfficial } from './factions.js';

export interface ParsedSpeech {
  speaker: string;
  party: string | null;
  text: string;
  speechType: string;
  isGovernment: boolean;
}

// „Name (Fraktion):" auf einer eigenen Zeile.
const SPEAKER = /\n([A-ZÄÖÜ][^(\n:]{2,60})\s*\(([^)]+)\):[ \t]*(?=\n)/g;
// Präsidium — nur Grenze.
const PRESIDENT =
  /\n(Vizepräsident(?:in)?|Präsident(?:in)?|Alterspräsident(?:in)?|Bundespräsident(?:in)?)\s+([A-ZÄÖÜ][^:\n]{2,40}):[ \t]*(?=\n)/g;
// „Name, Bundesminister …:" — Regierungsmitglieder ohne Partei in der Zeile.
const GOVERNMENT =
  /\n([A-ZÄÖÜ][^,\n]{2,50}),\s*(Bundeskanzler(?:in)?|Bundesminister(?:in)?(?:\s+[^\n:]{0,60})?|Parl\.\s*Staatssekretär(?:in)?(?:\s+[^\n:]{0,80})?|Staatsminister(?:in)?(?:\s+[^\n:]{0,60})?):[ \t]*(?=\n)/g;

const MIN_SPEECH_CHARS = 50;

interface Boundary {
  start: number;
  end: number;
  speaker: string;
  party: string | null;
  isPresident: boolean;
  isGovernment: boolean;
}

export function cleanProtocolText(text: string): string {
  return text
    .replace(/[\u00a0\u2007\u202f\u2060]/g, ' ')
    .replace(/[\u2014\u2013]/g, '-')
    .replace(/\t+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .replace(/\r\n?/g, '\n');
}

/** Ohne Klammerinhalte; Zeilenumbrüche bleiben für den Chunker stehen. */
export function stripParenthetical(text: string): string {
  return text
    .replace(/\([^)]+\)/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n[ \n]*/g, '\n')
    .trim();
}

export function parseSpeeches(rawText: string): ParsedSpeech[] {
  const text = `\n${cleanProtocolText(rawText)}\n`;
  const qaRanges = findQaSessionRanges(text);
  const boundaries: Boundary[] = [];

  for (const m of text.matchAll(SPEAKER)) {
    const speaker = m[1].trim();
    if (/^(?:frage|anfrage)\s/i.test(speaker)) continue;
    boundaries.push({
      start: m.index,
      end: m.index + m[0].length,
      speaker,
      party: normalizeParty(m[2]),
      isPresident: false,
      isGovernment: false,
    });
  }
  for (const m of text.matchAll(PRESIDENT)) {
    boundaries.push({
      start: m.index,
      end: m.index + m[0].length,
      speaker: `${m[1]} ${m[2].trim()}`,
      party: null,
      isPresident: true,
      isGovernment: false,
    });
  }
  for (const m of text.matchAll(GOVERNMENT)) {
    const speaker = m[1].trim();
    boundaries.push({
      start: m.index,
      end: m.index + m[0].length,
      speaker,
      party: partyForOfficial(speaker),
      isPresident: false,
      isGovernment: true,
    });
  }
  boundaries.sort((a, b) => a.start - b.start);

  const speeches: ParsedSpeech[] = [];
  boundaries.forEach((b, i) => {
    if (b.isPresident) return;
    const next = boundaries[i + 1];
    const speechText = stripParenthetical(text.slice(b.end, next ? next.start : text.length));
    if (speechText.length < MIN_SPEECH_CHARS) return;

    const contextStart = Math.max(i > 0 ? boundaries[i - 1].end : 0, b.start - 600);
    speeches.push({
      speaker: b.speaker,
      party: b.party,
      text: speechText,
      speechType: classifySpeech(text.slice(contextStart, b.start), b, qaRanges),
      isGovernment: b.isGovernment,
    });
  });
  return speeches;
}

interface QaRange {
  start: number;
  end: number;
  type: 'befragung' | 'fragestunde';
}

const QA_END =
  /(?:schließe ich die|beende ich die|Ende der)\s+(?:Befragung|Fragestunde|Regierungsbefragung)|Ich rufe (?:jetzt |nun )?(?:den )?(?:Tagesordnungspunkt|Zusatzpunkt)/gi;

/**
 * Bereiche der Regierungsbefragung und Fragestunde. Gesucht wird erst ab
 * „Beginn:" — davor steht das Inhaltsverzeichnis, das beide Formate nennt —, und
 * ein Bereich endet spätestens, wenn das Präsidium den nächsten Punkt aufruft.
 */
function findQaSessionRanges(text: string): QaRange[] {
  const sessionStart = /\nBeginn:/.exec(text)?.index ?? 0;
  const ranges: QaRange[] = [];
  const add = (pattern: RegExp, type: QaRange['type']) => {
    for (const m of text.matchAll(pattern)) {
      if (m.index < sessionStart) continue;
      QA_END.lastIndex = m.index + 1;
      const end = QA_END.exec(text);
      ranges.push({ start: m.index, end: end ? end.index + end[0].length : text.length, type });
    }
  };
  add(/Befragung der Bundesregierung|Regierungsbefragung/gi, 'befragung');
  add(/(?:^|\n)Fragestunde[ \t]*(?=\n|$)/g, 'fragestunde');
  return ranges.sort((a, b) => a.start - b.start);
}

/**
 * Redeform aus dem Text VOR der Sprecher*innen-Zeile — dort steht, wie das
 * Präsidium das Wort erteilt hat („Das Wort hat …", „Gestatten Sie eine
 * Zwischenfrage?", „Ich rufe die Frage 3 auf").
 */
function classifySpeech(context: string, b: Boundary, qaRanges: QaRange[]): string {
  const lower = context.toLowerCase();
  if (
    /ich rufe die frage \d+|die nächste (haupt)?frage stellt|nachfrage gibt|weitere frage gibt/.test(
      lower
    )
  ) {
    return 'fragestunde';
  }
  if (
    /(herr|frau)\s+(staatsminister|staatssekretär|bundesminister)[^.]*sie haben das wort/.test(
      lower
    ) ||
    /sie haben das wort[^.]{0,50}(staatsminister|staatssekretär|bundesminister)/.test(lower)
  ) {
    return 'fragestunde_antwort';
  }

  if (b.isGovernment) {
    const qa = qaRanges.find((r) => r.start <= b.start && b.start < r.end);
    if (!qa) return 'rede';
    return qa.type === 'befragung' ? 'befragung' : 'fragestunde_antwort';
  }

  if (context.includes('Kurzintervention')) return 'kurzintervention';
  if (
    context.includes('Zwischenfrage') ||
    context.includes('Gelegenheit, zu antworten') ||
    /[Ll]assen Sie.*zu\?|[Gg]estatten Sie|[Ee]rlauben Sie/.test(context)
  ) {
    return 'zwischenfrage';
  }
  if (/Nachfrage|Fragesteller|weitere Frage|Regierungsbefragung|Fragestunde/.test(context)) {
    return 'fragestunde';
  }
  return 'rede';
}
