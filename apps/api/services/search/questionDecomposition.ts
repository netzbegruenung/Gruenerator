/**
 * Split a message that asks several questions at once into its parts.
 *
 * Retrieval embeds the message as ONE vector. A message asking about a
 * petition, a donation total, a poll number and a heatwave averages out to a
 * point near none of them, and the union of hits comes back empty even though
 * every answer sits in the collection. Searching per sub-question and unioning
 * the hits is what makes those messages answerable at all.
 *
 * Deliberately pattern-based, not an LLM call: the shapes people actually type
 * (`A1 …`, `1. …`, `- …?`, or plain `X? Y?`) are recognisable without one, and
 * this sits in front of every notebook search — a model call here would put a
 * failure mode and a second of latency on the hot path.
 */

/** Cap on how many searches one message may fan out into. */
const MAX_SUB_QUESTIONS = 8;

/** Below this a fragment is a stray label or list marker, not a question. */
const MIN_SUB_QUESTION_LENGTH = 12;

/** `A1`, `12.`, `3)`, `-`, `•` at the start of a line. */
const ENUMERATOR_LINE = /^[ \t]*(?:[A-Za-z]?\d{1,2}[.):\]]?|[-*•])[ \t]+(?=\S)/;

/** `A1`/`C5`-style labels sitting inline in a single run-on paragraph. */
const INLINE_LABEL = /(?:^|\s)[A-Za-z]\d{1,2}[.):]?[ \t]+(?=[^\s])/g;

/**
 * Openers that mark an imperative or interrogative part, for batches typed
 * without question marks ("1. Fasse X zusammen  2. Nenne Y").
 */
const REQUEST_OPENERS =
  /^(?:wer|was|wie|wo|wann|warum|weshalb|wieso|welche[rsnm]?|wessen|wem|wen|gibt|ist|sind|war|waren|hat|haben|kann|können|nenne|nennen|liste|zeige|zeig|fasse|fass|erkläre|erklär|beschreibe|beschreib|vergleiche|vergleich|zitiere|zitier|belege|beleg|prüfe|prüf|analysiere|analysier|begründe|begründ|schildere|stelle|gib|finde|such|suche)\b/i;

const clean = (part: string): string =>
  part.replace(ENUMERATOR_LINE, '').replace(/\s+/g, ' ').trim();

const looksLikeRequest = (part: string): boolean =>
  part.includes('?') || REQUEST_OPENERS.test(part);

/** Group lines into parts, each starting at an enumerated line. */
function splitByEnumeratedLines(question: string): string[] {
  const lines = question.split(/\r?\n/);
  const starts = lines.filter((line) => ENUMERATOR_LINE.test(line)).length;
  if (starts < 2) return [];

  const parts: string[] = [];
  for (const line of lines) {
    if (ENUMERATOR_LINE.test(line)) {
      parts.push(line);
    } else if (parts.length > 0 && line.trim()) {
      // Continuation of the part above (wrapped line), not a new one.
      parts[parts.length - 1] += ` ${line}`;
    }
  }
  return parts;
}

/** Split a run-on paragraph carrying `A1 … A2 …` labels. */
function splitByInlineLabels(question: string): string[] {
  const offsets: number[] = [];
  for (const match of question.matchAll(INLINE_LABEL)) {
    offsets.push(match.index + (match[0].length - match[0].trimStart().length));
  }
  if (offsets.length < 2) return [];

  return offsets.map((start, i) => question.slice(start, offsets[i + 1] ?? question.length));
}

/** Split on sentence-final question marks. */
function splitByQuestionMarks(question: string): string[] {
  const parts = question.split(/(?<=\?)\s+/).filter((p) => p.trim());
  return parts.length >= 2 ? parts : [];
}

/**
 * Returns the sub-questions of a composite message, or `[]` when the message
 * asks a single question — callers should then search the message as-is.
 *
 * The full message stays in the caller's query list either way; these are
 * additional retrieval angles, never a replacement.
 */
export function splitCompositeQuestion(question: string): string[] {
  const text = (question || '').trim();
  if (!text) return [];

  const raw =
    splitByEnumeratedLines(text).length >= 2
      ? splitByEnumeratedLines(text)
      : splitByInlineLabels(text).length >= 2
        ? splitByInlineLabels(text)
        : splitByQuestionMarks(text);

  if (raw.length < 2) return [];

  const parts: string[] = [];
  const seen = new Set<string>();
  for (const candidate of raw) {
    const part = clean(candidate);
    if (part.length < MIN_SUB_QUESTION_LENGTH) continue;
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(part);
  }

  if (parts.length < 2) return [];

  // Guard against splitting prose that merely contains a list: at least two
  // parts have to read as an actual request.
  if (parts.filter(looksLikeRequest).length < 2) return [];

  return parts.slice(0, MAX_SUB_QUESTIONS);
}
