/**
 * Stufe „answer" des Bundestag-Q&A: aus den verifizierten Punkten wird ein
 * Antworttext mit `[n]`-Belegen. Das Modell sieht nur die nummerierten
 * Punkte, nie die Volltexte; ohne Punkte wird es gar nicht gefragt.
 */
import { type BundestagAnswerResponse, type BundestagFilter } from '@gruenerator/contracts';

import { aiText } from '../../ai/generate.js';

import { MAX_ANSWER_POINTS } from './budget.js';
import { type ReadResult } from './read.js';

/** Höchstens so viele Punkte je Dokument gehen in die Antwort. */
const MAX_POINTS_PER_DOC_IN_ANSWER = 4;
/** Schutz vor Bereichen wie „[1-99999999]". */
const MAX_RANGE = 100;

type Citation = BundestagAnswerResponse['citations'][number];

export interface ComposedAnswer {
  answer: string;
  citations: Citation[];
  /** Punkte, die wegen der Kappung nicht in die Antwort kamen. */
  capped: number;
  invalidCitations: number;
}

export const ANSWER_SYSTEM = [
  'Du beantwortest eine Frage zu Dokumenten des Deutschen Bundestags ausschließlich aus den nummerierten Punkten, die dir gegeben werden.',
  'Regeln:',
  '- Schreibe auf Deutsch, sachlich und knapp, ohne Persona und ohne Anrede.',
  '- Jede inhaltliche Aussage trägt den Beleg [n] des Punktes, aus dem sie stammt. Nutze nur Nummern, die in der Liste vorkommen.',
  '- Verwende kein Vorwissen und ergänze nichts, was nicht in den Punkten steht.',
  '- Benenne Lücken offen: was die Punkte nicht beantworten, Dokumente ohne Text und Dokumente, die nicht gelesen wurden (mit dem genannten Grund).',
  '- Widersprechen sich Punkte, gib beide Seiten mit ihren Belegen wieder.',
].join('\n');

const SKIP_REASON: Record<NonNullable<ReadResult['skipped']>, string> = {
  budget: 'nicht gelesen (Lesebudget erschöpft)',
  deadline: 'nicht gelesen (Zeitlimit erreicht)',
  missing: 'nicht gelesen (kein Text verfügbar)',
};

/** Dokumente, die nichts zu den Punkten beigetragen haben, samt Grund. */
export function unusedDocuments(results: readonly ReadResult[]): string[] {
  return results
    .filter((r) => r.skipped !== null || r.points.length === 0)
    .map((r) => {
      const reason = r.skipped
        ? SKIP_REASON[r.skipped]
        : r.relevant
          ? 'gelesen, aber ohne belegbare Aussage'
          : 'gelesen, ohne Treffer zur Frage';
      return `${r.doc.ref} (${r.doc.drucksachetyp}, ${r.doc.titel}): ${reason}`;
    });
}

/** Menschenlesbar, nur die gesetzten Filter. */
export function describeFilters(filters: BundestagFilter): string {
  const parts: string[] = [];
  if (filters.wahlperiode?.length) parts.push(`Wahlperiode ${filters.wahlperiode.join(', ')}`);
  if (filters.drucksachetyp?.length) parts.push(`Typ ${filters.drucksachetyp.join(', ')}`);
  if (filters.urheber?.length) parts.push(`Urheber ${filters.urheber.join(', ')}`);
  if (filters.datumVon) parts.push(`ab ${filters.datumVon}`);
  if (filters.datumBis) parts.push(`bis ${filters.datumBis}`);
  if (filters.dokumentnummer?.length) parts.push(`Drucksache ${filters.dokumentnummer.join(', ')}`);
  if (filters.deskriptor?.length) parts.push(`Schlagwort ${filters.deskriptor.join(', ')}`);
  if (filters.titel) parts.push(`Titel „${filters.titel}“`);
  return parts.length ? parts.join('; ') : 'keine Einschränkung';
}

/** Punkte global 1..n: je Dokument höchstens 4, in Dokumentreihenfolge, insgesamt höchstens `MAX_ANSWER_POINTS`. */
export function numberPoints(results: readonly ReadResult[]): {
  citations: Citation[];
  /** Parallel zu `citations`: Urheber des Dokuments, nur für den Prompt. */
  urheber: string[];
  capped: number;
} {
  const citations: Citation[] = [];
  const urheber: string[] = [];
  let capped = 0;
  for (const r of results) {
    r.points.forEach((p, i) => {
      if (i >= MAX_POINTS_PER_DOC_IN_ANSWER || citations.length >= MAX_ANSWER_POINTS) {
        capped++;
        return;
      }
      citations.push({
        n: citations.length + 1,
        ref: r.doc.ref,
        drucksachetyp: r.doc.drucksachetyp,
        datum: r.doc.datum,
        titel: r.doc.titel,
        pdfUrl: r.doc.pdfUrl,
        aussage: p.aussage,
        zitat: p.zitat,
      });
      urheber.push(r.doc.urheber.join(', ') || 'Urheber unbekannt');
    });
  }
  return { citations, urheber, capped };
}

function expand(token: string): number[] {
  const range = token.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (range) {
    const from = Number(range[1]);
    const to = Number(range[2]);
    if (to < from || to - from >= MAX_RANGE) return [from, to];
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  }
  return /^\d+$/.test(token) ? [Number(token)] : [];
}

/**
 * Entfernt `[n]`, `[n, m]` und `[n-m]` mit Nummern außerhalb 1..max. Gültige
 * Bezüge einer gemischten Klammer bleiben stehen; eine Klammer ohne gültige
 * Nummer verschwindet. Gezählt wird jede ungültige Nummer.
 */
export function stripInvalidCitations(
  text: string,
  max: number
): { text: string; invalid: number } {
  let invalid = 0;
  const out = text.replace(/\s?\[(\d+(?:\s*(?:,|[-–])\s*\d+)*)\]/g, (whole, inner: string) => {
    const nums = inner.split(',').flatMap((t) => expand(t.trim()));
    const valid = nums.filter((n) => n >= 1 && n <= max);
    invalid += nums.length - valid.length;
    if (valid.length === nums.length) return whole;
    if (valid.length === 0) return '';
    return ` [${[...new Set(valid)].join(', ')}]`;
  });
  return { text: out, invalid };
}

function emptyAnswer(
  filters: BundestagFilter,
  results: readonly ReadResult[],
  question: string
): string {
  const docs = unusedDocuments(results);
  const lines = [
    `Zu der Frage „${question}“ konnte ich in den durchsuchten Bundestagsdokumenten keine belegbare Aussage finden.`,
    `Durchsucht wurde mit: ${describeFilters(filters)}.`,
  ];
  if (docs.length > 0) {
    lines.push('Betrachtete Dokumente:', ...docs.map((d) => `- ${d}`));
  } else {
    lines.push('Es wurden keine passenden Dokumente gefunden.');
  }
  return lines.join('\n');
}

export async function composeAnswer({
  question,
  results,
  filters,
}: {
  question: string;
  results: readonly ReadResult[];
  filters: BundestagFilter;
}): Promise<ComposedAnswer> {
  const { citations, urheber, capped } = numberPoints(results);
  if (citations.length === 0) {
    return {
      answer: emptyAnswer(filters, results, question),
      citations,
      capped,
      invalidCitations: 0,
    };
  }

  const pointLines = citations.map(
    (c, i) =>
      `[${c.n}] ${c.ref} · ${c.drucksachetyp} · ${c.datum} · ${urheber[i]}: ${c.aussage} — „${c.zitat}“`
  );
  const unused = unusedDocuments(results);
  const prompt = [
    `Frage: ${question}`,
    '',
    'Punkte:',
    ...pointLines,
    '',
    unused.length > 0
      ? ['Dokumente ohne verwertbare Punkte:', ...unused.map((d) => `- ${d}`)].join('\n')
      : 'Alle Dokumente wurden gelesen und haben Punkte geliefert.',
  ].join('\n');

  const raw = await aiText({
    lane: 'bundestag_answer',
    system: ANSWER_SYSTEM,
    prompt,
    temperature: 0.2,
    maxOutputTokens: 2000,
  });
  const { text, invalid } = stripInvalidCitations(raw, citations.length);
  return { answer: text, citations, capped, invalidCitations: invalid };
}
