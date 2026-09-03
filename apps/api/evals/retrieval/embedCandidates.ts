/**
 * Die Kandidaten des Einbettungs-Bake-offs — und die Namen ihrer Wegwerf-Sammlungen.
 *
 * Registry und Namensregel liegen zusammen, weil beide Seiten des Laufs sie
 * brauchen: der Kopierer (`scripts/build-eval-embed-collection.ts`) legt die
 * Sammlung an, die Eval-Weiche (`runRetrievalEval.ts`, `annRecallCheck.ts`)
 * fragt sie ab. Ein zweiter Ort für die Regel hiesse: eine Messung, die eine
 * Sammlung durchsucht, die der Kopierer nie gefüllt hat.
 *
 * WARUM DIE SLUGS NICHT DIE MODELLNAMEN SIND. Zwei Kandidaten fahren dieselben
 * Gewichte auf verschiedenen Hosts (`qwen3-embedding-8b` bei GreenPT,
 * `Qwen3-Embedding-8B` bei Regolo) — als Slug unterschieden sie sich nur in der
 * Grossschreibung, und ein Sammlungsname, der bloss daran hängt, ist eine
 * Falle. Der Slug nennt darum Modell UND Host; `model` trägt die exakte
 * Modell-ID, die der Anbieter erwartet.
 *
 * Dimensionen und Kontextlängen sind nachgeschlagen, nicht geschätzt:
 *  - `bge-m3`: 1024 Dim., live gegen Cortecs' `POST /v1/embeddings` gemessen
 *    (03.09.2026, HTTP 200); 8192 Token laut BAAI-Modellkarte.
 *  - `bge-multilingual-gemma2`: `config.json` der Modellkarte
 *    (huggingface.co/BAAI/bge-multilingual-gemma2, abgerufen 03.09.2026) nennt
 *    `hidden_size: 3584` und `max_position_embeddings: 8192`.
 *  - `Qwen3-Embedding-8B`: `config.json` nennt `hidden_size: 4096`
 *    (`max_position_embeddings: 40960`), die Modellkarte "Context Length: 32k" —
 *    hier gilt die konservativere Angabe der Karte.
 *
 * Die Anleitung steht nur auf der Query-Seite und nur bei Qwen3: seine
 * Modellkarte sagt ausdrücklich "Each query must come with a one-sentence
 * instruction" und "No need to add instruction for retrieval documents". Das
 * ist die asymmetrische Form, die `mistral-embed` nicht kennt — wer sie
 * beidseitig anwendet, misst ein anderes Modell als das empfohlene.
 */

export type EmbedProvider = 'cortecs' | 'greenpt' | 'regolo';

export interface EmbedCandidate {
  /** Kennung auf der Kommandozeile und im Sammlungsnamen. Modell + Host. */
  readonly slug: string;
  readonly provider: EmbedProvider;
  /** Modell-ID, wie der Anbieter sie erwartet — Grossschreibung inklusive. */
  readonly model: string;
  readonly dims: number;
  readonly maxTokens: number;
  /** Nur auf der Anfrage-Seite, nie an Dokumenten. `null` = symmetrisch. */
  readonly queryInstruction: string | null;
}

/** Qwen3-Embedding erwartet eine Aufgabenbeschreibung je Anfrage. */
const QWEN3_QUERY_INSTRUCTION =
  'Given a German political question, retrieve passages that answer it';

export const EMBED_CANDIDATES = [
  {
    slug: 'bge-m3',
    provider: 'cortecs',
    model: 'bge-m3',
    dims: 1024,
    maxTokens: 8192,
    queryInstruction: null,
  },
  {
    slug: 'bge-gemma2-greenpt',
    provider: 'greenpt',
    model: 'bge-multilingual-gemma2',
    dims: 3584,
    maxTokens: 8192,
    queryInstruction: null,
  },
  {
    slug: 'qwen3-8b-greenpt',
    provider: 'greenpt',
    model: 'qwen3-embedding-8b',
    dims: 4096,
    maxTokens: 32768,
    queryInstruction: QWEN3_QUERY_INSTRUCTION,
  },
  {
    slug: 'qwen3-8b-regolo',
    provider: 'regolo',
    model: 'Qwen3-Embedding-8B',
    dims: 4096,
    maxTokens: 32768,
    queryInstruction: QWEN3_QUERY_INSTRUCTION,
  },
] as const satisfies readonly EmbedCandidate[];

export type EmbedCandidateSlug = (typeof EMBED_CANDIDATES)[number]['slug'];

/** Der Kandidat zu einem Slug, oder `null`. Nimmt `string`, weil der Wert von
 *  der Kommandozeile bzw. aus der Umgebung kommt. */
export function getEmbedCandidate(slug: string): EmbedCandidate | null {
  return EMBED_CANDIDATES.find((c) => c.slug === slug) ?? null;
}

/** Alle Slugs, für Fehlermeldungen und `--help`. */
export function embedCandidateSlugs(): string[] {
  return EMBED_CANDIDATES.map((c) => c.slug);
}

/**
 * Das Präfix, an dem eine Wegwerf-Sammlung erkennbar ist.
 *
 * Es ist die einzige Schranke zwischen dem Bake-off und der Produktion: der
 * Kopierer legt nur Sammlungen mit diesem Präfix an und löscht nur solche.
 * Keine Sammlung aus `config/qdrantCollectionsSchema.ts` trägt es — der Test
 * in `embedCandidates.vitest.ts` prüft das gegen die echte Schema-Liste, statt
 * es zu behaupten.
 */
export const EVAL_EMBED_PREFIX = 'eval_embed_';

/** Trennt Slug und Quell-Sammlung. Doppelt, weil beide Teile einfache
 *  Unterstriche enthalten (`bge_m3` nicht, `grundsatz_documents` schon). */
export const EVAL_EMBED_SEPARATOR = '__';

/**
 * `eval_embed_<slug>__<quellsammlung>`.
 *
 * Die Quell-Sammlung steht im Namen, weil ein Kandidat gegen ALLE fünf
 * Eval-Sammlungen gemessen wird und Qdrant je Sammlung eine eigene physische
 * Sammlung braucht — ein Name ohne sie hätte den zweiten Aufbau still über den
 * ersten geschrieben.
 */
export function evalCollectionName(slug: string, sourceCollection: string): string {
  if (slug.length === 0 || sourceCollection.length === 0) {
    throw new Error('evalCollectionName: slug and sourceCollection must be non-empty');
  }
  if (slug.includes(EVAL_EMBED_SEPARATOR)) {
    throw new Error(`evalCollectionName: slug must not contain "${EVAL_EMBED_SEPARATOR}": ${slug}`);
  }
  return `${EVAL_EMBED_PREFIX}${slug}${EVAL_EMBED_SEPARATOR}${sourceCollection}`;
}

/**
 * Nimmt genau die Namen an, die {@link evalCollectionName} erzeugt.
 *
 * Das ist die Bedingung, gegen die `--delete` prüft. Sie ist bewusst enger als
 * ein blosses `startsWith`: beide Teile müssen da und nichtleer sein, sonst
 * käme `eval_embed_` allein durch.
 */
export function isEvalEmbedCollection(name: string): boolean {
  if (!name.startsWith(EVAL_EMBED_PREFIX)) return false;
  const rest = name.slice(EVAL_EMBED_PREFIX.length);
  const at = rest.indexOf(EVAL_EMBED_SEPARATOR);
  if (at <= 0) return false;
  const source = rest.slice(at + EVAL_EMBED_SEPARATOR.length);
  return source.length > 0;
}

export interface EvalEmbedTarget {
  /** Die Sammlung, die dieser Lauf durchsucht. */
  readonly collection: string;
  /** `null` heisst: Produktionssammlung, `mistral-embed`, alles wie bisher. */
  readonly candidate: EmbedCandidate | null;
}

/**
 * Wohin ein Lauf zeigt — die eine Stelle, an der `EVAL_EMBED_CANDIDATE`
 * ausgewertet wird.
 *
 * Rein, damit sie prüfbar ist: ein Tippfehler im Slug darf nicht in einem Lauf
 * gegen die Produktionssammlung enden, der dann wie eine Basismessung aussieht.
 * Deshalb wirft sie bei einem unbekannten Slug, statt still zurückzufallen.
 *
 * `sourceQdrantCollection` ist der PHYSISCHE Name (`grundsatz_documents`), den
 * `getSystemCollectionConfig(fall.collection).qdrantCollection` liefert — nicht
 * die Fall-Kennung (`grundsatz-system`).
 */
export function resolveEvalTarget(
  env: { EVAL_EMBED_CANDIDATE?: string | undefined },
  sourceQdrantCollection: string
): EvalEmbedTarget {
  const slug = env.EVAL_EMBED_CANDIDATE;
  if (!slug) return { collection: sourceQdrantCollection, candidate: null };
  const candidate = getEmbedCandidate(slug);
  if (!candidate) {
    throw new Error(
      `EVAL_EMBED_CANDIDATE="${slug}" is not a known candidate. Known: ${embedCandidateSlugs().join(', ')}`
    );
  }
  return {
    collection: evalCollectionName(candidate.slug, sourceQdrantCollection),
    candidate,
  };
}
