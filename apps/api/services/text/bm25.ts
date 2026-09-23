/**
 * BM25 sparse-vector encoder for Qdrant hybrid search.
 *
 * Produces sparse vectors client-side the same way Qdrant's own FastEmbed
 * BM25 does: the client computes only the term-frequency component; the IDF
 * component is applied server-side by the collection's sparse-vector
 * `modifier: 'idf'`. No model download, pure text processing.
 *
 * German-specific pipeline: lowercasing → tokenization → stopword removal →
 * CISTEM stemming (Weißweiler & Fraser 2017 — compact, deterministic, built
 * for German) → FNV-1a term hashing to uint32 indices.
 *
 * Document and query side MUST use the same pipeline; queries get plain 1.0
 * weights (BM25 query-side TF is 1 for typical short queries).
 *
 * FROZEN once a collection has been backfilled: stemmer, stopword list and
 * hash together define the sparse index. Changing any of them makes queries
 * hash differently than the stored documents — the sparse side then degrades
 * silently instead of failing. Any change requires a full sparse re-backfill
 * (`scripts/migrate-bm25-sparse.ts`, no re-embedding needed).
 *
 * Der Stemmer ist deshalb ein PARAMETER mit `cistem` als Vorgabe, kein
 * Schalter: ein Aufrufer, der einen anderen mitgibt, muss beide Seiten selbst
 * versorgen — und das tut genau einer, der Stemmer-Vergleich in
 * `evals/retrieval/bm25Candidates.ts` (#3188), der dafür eine eigene
 * Wegwerf-Sammlung baut. Ohne den Parameter hiesse dieselbe Messung: die
 * Produktionsfunktion umschreiben und hoffen, dass sie danach wieder so
 * aussieht wie vorher.
 */

const K1 = 1.2;
const B = 0.75;
/** FastEmbed's default expected average document length in tokens. */
const AVG_DOC_LENGTH = 256;

/** Compact German stopword list (function words only — content words stay). */
const GERMAN_STOPWORDS = new Set([
  'aber',
  'alle',
  'allem',
  'allen',
  'aller',
  'alles',
  'als',
  'also',
  'am',
  'an',
  'ander',
  'andere',
  'anderem',
  'anderen',
  'anderer',
  'anderes',
  'auch',
  'auf',
  'aus',
  'bei',
  'bin',
  'bis',
  'bist',
  'da',
  'damit',
  'dann',
  'das',
  'dass',
  'dasselbe',
  'dazu',
  'dein',
  'deine',
  'dem',
  'den',
  'denn',
  'der',
  'derer',
  'des',
  'dessen',
  'dich',
  'die',
  'dies',
  'diese',
  'dieselbe',
  'diesem',
  'diesen',
  'dieser',
  'dieses',
  'dir',
  'doch',
  'dort',
  'du',
  'durch',
  'ein',
  'eine',
  'einem',
  'einen',
  'einer',
  'eines',
  'einig',
  'einige',
  'einigem',
  'einigen',
  'einiger',
  'einiges',
  'einmal',
  'er',
  'es',
  'etwas',
  'euch',
  'euer',
  'eure',
  'für',
  'gegen',
  'gewesen',
  'hab',
  'habe',
  'haben',
  'hat',
  'hatte',
  'hatten',
  'hier',
  'hin',
  'hinter',
  'ich',
  'ihm',
  'ihn',
  'ihnen',
  'ihr',
  'ihre',
  'im',
  'in',
  'indem',
  'ins',
  'ist',
  'ja',
  'jede',
  'jedem',
  'jeden',
  'jeder',
  'jedes',
  'jene',
  'jenem',
  'jenen',
  'jener',
  'jenes',
  'jetzt',
  'kann',
  'kein',
  'keine',
  'keinem',
  'keinen',
  'keiner',
  'keines',
  'können',
  'könnte',
  'machen',
  'man',
  'manche',
  'manchem',
  'manchen',
  'mancher',
  'manches',
  'mein',
  'meine',
  'mich',
  'mir',
  'mit',
  'muss',
  'musste',
  'nach',
  'nicht',
  'nichts',
  'noch',
  'nun',
  'nur',
  'ob',
  'oder',
  'ohne',
  'sehr',
  'sein',
  'seine',
  'sich',
  'sie',
  'sind',
  'so',
  'solche',
  'solchem',
  'solchen',
  'solcher',
  'solches',
  'soll',
  'sollte',
  'sondern',
  'sonst',
  'über',
  'um',
  'und',
  'uns',
  'unser',
  'unsere',
  'unter',
  'viel',
  'vom',
  'von',
  'vor',
  'während',
  'war',
  'waren',
  'warst',
  'was',
  'weg',
  'weil',
  'weiter',
  'welche',
  'welchem',
  'welchen',
  'welcher',
  'welches',
  'wenn',
  'werde',
  'werden',
  'wie',
  'wieder',
  'will',
  'wir',
  'wird',
  'wirst',
  'wo',
  'wollen',
  'wollte',
  'würde',
  'würden',
  'zu',
  'zum',
  'zur',
  'zwar',
  'zwischen',
]);

const MIN_TOKEN_LENGTH = 2;

export interface SparseVector {
  indices: number[];
  values: number[];
}

/**
 * CISTEM stemmer for German (Weißweiler & Fraser 2017).
 * Case-insensitive variant; deterministic and affix-light — well suited for
 * matching inflected forms without a full Snowball implementation.
 */
export function cistem(word: string): string {
  let w = word.toLowerCase();
  w = w.replace(/ß/g, 'ss').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ä/g, 'a');

  // Reference regex is ^ge(.{4,}) — fires from total length 6 on.
  if (w.length >= 6 && w.startsWith('ge')) {
    w = w.slice(2);
  }

  w = w.replace(/sch/g, '$').replace(/ei/g, '%').replace(/ie/g, '&').replace(/(.)\1/g, '$1*');

  while (w.length > 3) {
    if (w.length > 5 && (w.endsWith('em') || w.endsWith('er') || w.endsWith('nd'))) {
      w = w.slice(0, -2);
      continue;
    }
    if (w.endsWith('e') || w.endsWith('s') || w.endsWith('n') || w.endsWith('t')) {
      w = w.slice(0, -1);
      continue;
    }
    break;
  }

  w = w.replace(/(.)\*/g, '$1$1').replace(/\$/g, 'sch').replace(/%/g, 'ei').replace(/&/g, 'ie');

  return w;
}

/** FNV-1a 32-bit hash → sparse index space. */
const MAX_HASH_CHARS = 64;

export function hashTerm(term: string): number {
  let hash = 0x811c9dc5;
  const len = Math.min(term.length, MAX_HASH_CHARS);
  for (let i = 0; i < len; i++) {
    hash ^= term.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Ein Wortstamm-Bildner. `cistem` ist der einzige, den die Produktion kennt.
 */
export type Stemmer = (word: string) => string;

/** Tokenize + stopword-filter + stem. Shared by document and query side. */
export function bm25Terms(text: string, stem: Stemmer = cistem): string[] {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-zäöüß0-9\s-]/gi, ' ')
    .split(/[\s-]+/)
    .filter((t) => t.length >= MIN_TOKEN_LENGTH && !GERMAN_STOPWORDS.has(t));

  return tokens.map((t) => (/^\d+$/.test(t) ? t : stem(t)));
}

/**
 * Encode a document chunk as a BM25 sparse vector.
 * Values carry the TF component `tf·(k1+1) / (tf + k1·(1−b+b·len/avgLen))`;
 * Qdrant multiplies in the IDF via the collection's `modifier: 'idf'`.
 */
export function encodeBm25Document(text: string, stem: Stemmer = cistem): SparseVector {
  const terms = bm25Terms(text, stem);
  if (terms.length === 0) return { indices: [], values: [] };

  const termFreq = new Map<number, number>();
  for (const term of terms) {
    const idx = hashTerm(term);
    termFreq.set(idx, (termFreq.get(idx) || 0) + 1);
  }

  const lenNorm = 1 - B + B * (terms.length / AVG_DOC_LENGTH);
  const indices: number[] = [];
  const values: number[] = [];
  for (const [idx, tf] of termFreq) {
    indices.push(idx);
    values.push((tf * (K1 + 1)) / (tf + K1 * lenNorm));
  }

  return { indices, values };
}

/** Encode a search query as a BM25 sparse vector (uniform weights). */
export function encodeBm25Query(text: string, stem: Stemmer = cistem): SparseVector {
  const terms = bm25Terms(text, stem);
  const indices = Array.from(new Set(terms.map(hashTerm)));
  return { indices, values: indices.map(() => 1) };
}
