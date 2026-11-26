/**
 * Der Satz im zitierten Chunk, der die Aussage der Antwort belegt.
 *
 * `cited_text` einer Notebook-Antwort ist ein Ausschnitt bis 1500 Zeichen —
 * passend für Karte und Folgezug, aber als Markierung färbt er im PDF eine
 * halbe Seite, und mehrere Zitate in dasselbe Dokument färben es ganz. `quote`
 * ist der eine Satz, den Text- und PDF-Ansicht markieren.
 *
 * Lexikalisch wie `claimCandidates` (`notebook_quellen` cite): die Aussage ist
 * der Antwortsatz vor der Marke, gewählt wird der Chunk-Satz mit den meisten
 * gemeinsamen Inhaltswörtern. Ohne klaren Treffer gibt es kein `quote` — die
 * Ansichten fallen dann auf `cited_text` zurück, wie bisher.
 */
import { SOURCE_LINK_SCHEME } from '@gruenerator/shared/utils';

import { contentWords, splitSentences } from '../text/sentences.js';

const MIN_OVERLAP = 2;
/** Länger ist kein Satz, sondern ein Block ohne Satzzeichen (Tabelle, Liste). */
const MAX_QUOTE_CHARS = 400;

const MARKER = new RegExp(`\\[cite:(\\d+)\\]|\\]\\(${SOURCE_LINK_SCHEME}:(\\d+)\\)`, 'g');
/** Ende des vorigen Satzes, eine Zeile oder eine frühere Marke. */
const CLAIM_START = /[.!?…]\s|\n|\[cite:\d+\]/g;

/** Je Zitatnummer die Antwortsätze, die sie tragen. */
export function claimsByCitation(answer: string): Map<string, string[]> {
  const claims = new Map<string, string[]>();
  for (const m of answer.matchAll(MARKER)) {
    const id = m[1] ?? m[2]!;
    // „Aussage.[cite:1][cite:2]" und „Aussage. [cite:1]": die Marke hängt
    // hinter dem Satzende, belegt aber den Satz davor.
    const before = answer.slice(0, m.index).replace(/(?:\s|\[cite:\d+\]|[.!?…])+$/u, '');
    let from = 0;
    for (const b of before.matchAll(CLAIM_START)) from = b.index + b[0].length;
    const claim = before.slice(from).trim();
    if (!claim) continue;
    const list = claims.get(id) ?? [];
    list.push(claim);
    claims.set(id, list);
  }
  return claims;
}

/**
 * Der Chunk-Satz, der die Aussage am besten trägt, oder `null`. Gezählt werden
 * gemeinsame Inhaltswörter mit der Aussage; die Frage entscheidet Gleichstände
 * und hilft kurzen Aussagen („Es gibt Trinkbrunnen.") über die Schwelle. Ohne
 * ein Wort der Aussage zählt ein Satz nie — die Frage gilt für alle Zitate.
 */
export function supportingSentence(
  chunkText: string,
  claims: readonly string[],
  question = ''
): string | null {
  const claimWords = contentWords(claims.join(' '));
  if (claimWords.size === 0) return null;
  const questionWords = contentWords(question);
  let best: { text: string; claim: number; question: number } | null = null;
  for (const s of splitSentences(chunkText)) {
    if (s.text.length > MAX_QUOTE_CHARS) continue;
    let claim = 0;
    let fromQuestion = 0;
    for (const w of contentWords(s.text)) {
      if (claimWords.has(w)) claim++;
      else if (questionWords.has(w)) fromQuestion++;
    }
    if (claim === 0 || claim + fromQuestion < MIN_OVERLAP) continue;
    if (!best || claim > best.claim || (claim === best.claim && fromQuestion > best.question)) {
      best = { text: s.text, claim, question: fromQuestion };
    }
  }
  return best?.text ?? null;
}
