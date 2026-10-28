// SPDX-License-Identifier: MPL-2.0
import { foldUmlauts, GERMAN_PLURAL_ENDINGS, translateWord } from './searchTranslations.js';

/**
 * Asset search matches whole words, never substrings: "car" must not hit
 * "Cart", "air" must not hit "Chair". Every query word has to match; results
 * are ranked so that "Car" beats "Car Fan Auto" before any list is truncated.
 */

interface Term {
  text: string;
  weight: number;
  /** Typed by the user (German) rather than looked up in the dictionary. */
  literal: boolean;
}

type CompiledQuery = Term[][];

const TAG_WEIGHT = 0.85;
const INFLECTIONS = new Set(['s', 'es', 'ed', 'er', 'ing']);
const PLURALS = new Set<string>(GERMAN_PLURAL_ENDINGS);
const VARIANT_WORDS = new Set(['filled', 'fill', 'solid', 'line', 'outline', 'off', 'alt']);

const toWords = (text: string) =>
  foldUmlauts(text)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

function compileQuery(query: string): CompiledQuery {
  return toWords(query).map((word) => {
    const { terms, exact } = translateWord(word);
    const base = exact ? 0.95 : 0.6;
    return [
      { text: word, weight: 1, literal: true },
      ...terms.map((text, i) => ({ text, weight: i === 0 ? base : base - 0.1, literal: false })),
    ];
  });
}

function termScore(term: Term, words: string[]): number {
  let best = 0;
  for (const word of words) {
    if (word === term.text) return term.weight;
    if (term.literal) {
      // German compounds: "sonne" finds "Sonnenblume", "blume" finds "Sonnenblume".
      if (term.text.length >= 3 && word.startsWith(term.text)) best = Math.max(best, 0.7);
      else if (term.text.length >= 4 && word.endsWith(term.text)) best = Math.max(best, 0.6);
      // Short compound heads ("rad" in "Zahnrad") are noisier ("eis" in "Kreis"): rank them last.
      else if (term.text.length === 3 && word.endsWith(term.text)) best = Math.max(best, 0.4);
      // German plural typed, singular stored: "menschen" finds the tag "mensch".
      else if (
        word.length >= 4 &&
        term.text.startsWith(word) &&
        PLURALS.has(term.text.slice(word.length))
      )
        best = Math.max(best, 0.7);
    } else if (word.startsWith(term.text) && INFLECTIONS.has(word.slice(term.text.length))) {
      // Inflections only ("tree" → "trees"), not other words ("car" → "cart", "star" → "stark").
      best = Math.max(best, term.weight * 0.8);
    }
  }
  return best;
}

function scoreMatch(query: CompiledQuery, name: string, tags: readonly string[] = []): number {
  if (query.length === 0) return 0;
  const nameWords = toWords(name);
  const tagWords = tags.flatMap(toWords);
  let total = 0;
  for (const terms of query) {
    let best = 0;
    let corroborating = 0;
    for (const term of terms) {
      const score = Math.max(termScore(term, nameWords), termScore(term, tagWords) * TAG_WEIGHT);
      if (score > 0) corroborating++;
      best = Math.max(best, score);
    }
    if (best === 0) return 0;
    // Several terms of one word agreeing ("fahrrad", "bicycle", "bike") lift an item
    // above one that shares only a broad keyword, e.g. a photo's category.
    total += best + Math.min(corroborating - 1, 2) * 0.05;
  }
  // The whole name IS the query, as typed or in its main translation: "Car" for "auto".
  const phrase = nameWords.join(' ');
  const typed = query.map((terms) => terms[0].text).join(' ');
  const translated = query.map((terms) => (terms[1] ?? terms[0]).text).join(' ');
  if (phrase === typed || phrase === translated) total += 0.5;
  const variants = nameWords.filter((w) => VARIANT_WORDS.has(w) || /^\d+$/.test(w)).length;
  return total - variants * 0.05 - nameWords.length * 0.01;
}

/** Items matching the query, best match first; ties keep catalogue order. */
export function rankByQuery<T>(
  items: readonly T[],
  query: string,
  fields: (item: T) => [name: string, tags?: readonly string[]]
): T[] {
  const compiled = compileQuery(query);
  if (compiled.length === 0) return [];
  const scored: { item: T; score: number }[] = [];
  for (const item of items) {
    const score = scoreMatch(compiled, ...fields(item));
    if (score > 0) scored.push({ item, score });
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.item);
}
