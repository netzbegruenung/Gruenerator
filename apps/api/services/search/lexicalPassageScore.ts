/**
 * Query-term scoring without a network call.
 *
 * This is the distiller's fallback when the cross-encoder is unavailable. It
 * has to exist and it has to be honest: `rerankPipeline` reports a failure by
 * returning the candidates in DOCUMENT order, so "take the top K" would
 * silently degrade to "take the first K" — the head-cut this whole change set
 * is trying to get rid of, reported as a success.
 *
 * `extractKeyParagraphs` moved here unchanged from
 * `WebSearchGraph/utilities/contentExtractor.ts`; its two callers keep their
 * exact previous behaviour.
 */

/** Frequent German words that match everywhere and therefore separate nothing. */
const GERMAN_STOPWORDS = new Set([
  'aber',
  'alle',
  'allem',
  'allen',
  'aller',
  'alles',
  'als',
  'also',
  'auch',
  'auf',
  'aus',
  'bei',
  'beim',
  'bin',
  'bis',
  'dabei',
  'damit',
  'dann',
  'das',
  'dass',
  'dem',
  'den',
  'denn',
  'der',
  'des',
  'die',
  'dies',
  'diese',
  'diesem',
  'diesen',
  'dieser',
  'dieses',
  'doch',
  'dort',
  'durch',
  'ein',
  'eine',
  'einem',
  'einen',
  'einer',
  'eines',
  'für',
  'gegen',
  'hat',
  'hatte',
  'hier',
  'ihr',
  'ihre',
  'immer',
  'ist',
  'kann',
  'mehr',
  'mit',
  'nach',
  'nicht',
  'noch',
  'nur',
  'oder',
  'schon',
  'sein',
  'seine',
  'sich',
  'sie',
  'sind',
  'über',
  'und',
  'uns',
  'unter',
  'vom',
  'von',
  'vor',
  'war',
  'waren',
  'was',
  'wenn',
  'werden',
  'wie',
  'wir',
  'wird',
  'wurde',
  'zum',
  'zur',
  'zwischen',
]);

const MIN_TERM_LENGTH = 3;

/**
 * Pulls the scoring terms out of a query.
 * Exported for tests; callers normally go through {@link scoreTextsLexically}.
 */
export function queryTerms(query: string): string[] {
  return (query ?? '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length >= MIN_TERM_LENGTH && !GERMAN_STOPWORDS.has(term));
}

/**
 * Scores each text by query-term density.
 *
 * Normalized by `sqrt(length)`, without which a long paragraph always outranks
 * a short exact match purely by having more room for accidental hits — the
 * failure mode that makes an unnormalized count useless for passage selection.
 *
 * Substring counting rather than word-boundary regexes on purpose: `\b` is not
 * a word boundary next to `ä`/`ö`/`ü` unless the pattern carries the `u` flag,
 * so a boundary-based German matcher fails silently on exactly the terms that
 * matter. Substring counting also gives compounds ("Klimaschutzgesetz" for
 * "Klimaschutz") for free.
 *
 * Returns one score per input, in input order. All-zero when the query has no
 * usable terms — the caller then keeps document order, which is the correct
 * "we know nothing" answer.
 */
export function scoreTextsLexically(texts: readonly string[], query: string): number[] {
  const terms = queryTerms(query);
  if (terms.length === 0) return texts.map(() => 0);

  return texts.map((text) => {
    const haystack = (text ?? '').toLowerCase();
    if (haystack.length === 0) return 0;
    let hits = 0;
    for (const term of terms) hits += haystack.split(term).length - 1;
    return hits / Math.sqrt(haystack.length);
  });
}

/**
 * Extract key paragraphs from content based on query relevance.
 *
 * Moved verbatim from WebSearchGraph/utilities/contentExtractor.ts — behaviour
 * is deliberately unchanged, including the unnormalized scoring, so its
 * existing callers are unaffected by this move.
 */
export function extractKeyParagraphs(
  content: string,
  query: string,
  maxLength: number = 400
): string {
  if (!content || content.length <= maxLength) {
    return content || '';
  }

  // Split content into paragraphs
  const paragraphs = content.split(/\n\s*\n/).filter((p) => p.trim().length > 50);

  // Simple relevance scoring based on query terms
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 2);

  const scoredParagraphs = paragraphs.map((paragraph) => {
    const lowerPara = paragraph.toLowerCase();
    const score = terms.reduce((acc, term) => acc + (lowerPara.split(term).length - 1), 0);
    return { paragraph: paragraph.trim(), score };
  });

  // Sort by relevance and take top paragraphs that fit within maxLength
  scoredParagraphs.sort((a, b) => b.score - a.score);

  let result = '';
  for (const { paragraph } of scoredParagraphs) {
    if (result.length + paragraph.length + 3 <= maxLength) {
      // +3 for spacing
      result += (result ? '\n\n' : '') + paragraph;
    } else if (result.length === 0) {
      // If even the first paragraph is too long, truncate it
      result = paragraph.slice(0, maxLength - 3) + '...';
      break;
    } else {
      break;
    }
  }

  return result || content.slice(0, maxLength - 3) + '...';
}
