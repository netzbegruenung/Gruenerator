/**
 * Die Stemmer-Kandidaten des BM25-Vergleichs — und die Namen ihrer
 * Wegwerf-Sammlungen (#3188).
 *
 * Dieselbe Bauform wie `embedCandidates.ts`, und aus demselben Grund an einem
 * Ort: der Kopierer (`scripts/build-eval-bm25-collection.ts`) legt die Sammlung
 * an, die Eval-Weiche (`runRetrievalEval.ts`) fragt sie ab. Ein zweiter Ort für
 * die Namensregel hiesse: eine Messung, die eine Sammlung durchsucht, die der
 * Kopierer nie gefüllt hat.
 *
 * WAS HIER ANDERS IST ALS BEIM EINBETTUNGS-BAKE-OFF. Dort wird der DICHTE
 * Vektor neu gerechnet und der sparse mitkopiert; hier genau umgekehrt. Und
 * anders als eine Einbettung ist ein Sparse-Vektor nicht bloss ein anderer
 * Zahlenraum, sondern ein anderes ALPHABET: derselbe Text ergibt unter einem
 * anderen Stemmer andere Hash-Indizes. Anfrage und Dokument müssen deshalb
 * denselben Stemmer sehen — die Anfrageseite über
 * `SearchOptions.sparseQueryVector`, die Dokumentseite über den Kopierer. Wer
 * nur eine Seite umstellt, misst eine leere Trefferliste und hält sie für ein
 * Ergebnis. Genau davor warnt der Kopfkommentar von `services/text/bm25.ts`.
 */
import {
  encodeBm25Document,
  encodeBm25Query,
  type SparseVector,
  type Stemmer,
} from '../../services/text/index.js';

import { snowballGerman } from './snowballGerman.js';

export interface Bm25Candidate {
  /** Kennung auf der Kommandozeile und im Sammlungsnamen. */
  readonly slug: string;
  readonly stem: Stemmer;
  /** Woher der Algorithmus stammt — für den Bericht, nicht für den Code. */
  readonly source: string;
}

export const BM25_CANDIDATES = [
  {
    slug: 'snowball',
    stem: snowballGerman,
    source: 'snowballstem.org/algorithms/german — derselbe Stemmer wie Qdrants FastEmbed-BM25',
  },
] as const satisfies readonly Bm25Candidate[];

export function getBm25Candidate(slug: string): Bm25Candidate | null {
  return BM25_CANDIDATES.find((c) => c.slug === slug) ?? null;
}

export function bm25CandidateSlugs(): string[] {
  return BM25_CANDIDATES.map((c) => c.slug);
}

/**
 * Das Präfix, an dem eine Wegwerf-Sammlung dieses Vergleichs erkennbar ist.
 *
 * Eigenes Präfix und nicht `eval_embed_`: `--delete` des Einbettungs-Bake-offs
 * darf die Sammlungen dieses Laufs nicht mitnehmen und umgekehrt. Keine
 * Sammlung aus `config/qdrantCollectionsSchema.ts` trägt es — der Test prüft
 * das gegen die echte Schema-Liste, statt es zu behaupten.
 */
export const EVAL_BM25_PREFIX = 'eval_bm25_';

/** Trennt Slug und Quell-Sammlung; beide enthalten einfache Unterstriche. */
export const EVAL_BM25_SEPARATOR = '__';

/** Was allen Sammlungen EINES Kandidaten gemeinsam ist. */
export function bm25CandidatePrefix(slug: string): string {
  if (slug.length === 0) throw new Error('bm25CandidatePrefix: slug must be non-empty');
  if (slug.includes(EVAL_BM25_SEPARATOR)) {
    throw new Error(`bm25CandidatePrefix: slug must not contain "${EVAL_BM25_SEPARATOR}": ${slug}`);
  }
  return `${EVAL_BM25_PREFIX}${slug}${EVAL_BM25_SEPARATOR}`;
}

/** `eval_bm25_<slug>__<quellsammlung>`. */
export function bm25CollectionName(slug: string, sourceCollection: string): string {
  if (sourceCollection.length === 0) {
    throw new Error('bm25CollectionName: sourceCollection must be non-empty');
  }
  return `${bm25CandidatePrefix(slug)}${sourceCollection}`;
}

/** Nimmt genau die Namen an, die {@link bm25CollectionName} erzeugt. */
export function isEvalBm25Collection(name: string): boolean {
  if (!name.startsWith(EVAL_BM25_PREFIX)) return false;
  const rest = name.slice(EVAL_BM25_PREFIX.length);
  const at = rest.indexOf(EVAL_BM25_SEPARATOR);
  if (at <= 0) return false;
  return rest.slice(at + EVAL_BM25_SEPARATOR.length).length > 0;
}

/** Nur Namen, die {@link isEvalBm25Collection} annimmt — die Schranke vor `--delete`. */
export function guardDelete(names: readonly string[], slug: string | null = null): string[] {
  const prefix = slug === null ? null : bm25CandidatePrefix(slug);
  return names.filter(
    (name) => isEvalBm25Collection(name) && (prefix === null || name.startsWith(prefix))
  );
}

/**
 * Löscht die Wegwerf-Sammlungen und nur die. Die zweite Prüfung in der
 * Schleife ist Absicht — wer `guardDelete` durch etwas Grosszügigeres ersetzt,
 * muss zwei Stellen ändern, nicht eine.
 */
export async function deleteEvalCollections(
  names: readonly string[],
  deleteFn: (name: string) => Promise<unknown>,
  slug: string | null = null
): Promise<string[]> {
  const deletable = guardDelete(names, slug);
  for (const name of deletable) {
    if (!isEvalBm25Collection(name)) {
      throw new Error(`refusing to delete "${name}": not an eval collection`);
    }
    await deleteFn(name);
  }
  return deletable;
}

/**
 * Der Kandidat dieses Laufs — die eine Stelle, an der `EVAL_BM25_CANDIDATE`
 * gelesen wird. Wirft bei unbekanntem Slug, statt still auf die
 * Produktionssammlung zurückzufallen: ein Tippfehler darf nicht als
 * Kandidatenmessung durchgehen.
 */
export function resolveBm25Candidate(env: {
  EVAL_BM25_CANDIDATE?: string | undefined;
}): Bm25Candidate | null {
  const slug = env.EVAL_BM25_CANDIDATE;
  if (!slug) return null;
  const candidate = getBm25Candidate(slug);
  if (!candidate) {
    throw new Error(
      `EVAL_BM25_CANDIDATE="${slug}" is not a known candidate. Known: ${bm25CandidateSlugs().join(', ')}`
    );
  }
  return candidate;
}

export interface EvalBm25Target {
  readonly collection: string;
  /** `null` heisst: Produktionssammlung, CISTEM, alles wie bisher. */
  readonly candidate: Bm25Candidate | null;
}

/** Wohin ein Lauf zeigt: Produktionssammlung oder Wegwerf-Sammlung. */
export function resolveBm25Target(
  env: { EVAL_BM25_CANDIDATE?: string | undefined },
  sourceQdrantCollection: string
): EvalBm25Target {
  const candidate = resolveBm25Candidate(env);
  if (candidate === null) return { collection: sourceQdrantCollection, candidate: null };
  return { collection: bm25CollectionName(candidate.slug, sourceQdrantCollection), candidate };
}

/** Der Dokument-Vektor eines Kandidaten. */
export function encodeCandidateDocument(text: string, candidate: Bm25Candidate): SparseVector {
  return encodeBm25Document(text, candidate.stem);
}

/** Der Anfrage-Vektor eines Kandidaten — geht als `options.sparseQueryVector` rein. */
export function encodeCandidateQuery(text: string, candidate: Bm25Candidate): SparseVector {
  return encodeBm25Query(text, candidate.stem);
}
