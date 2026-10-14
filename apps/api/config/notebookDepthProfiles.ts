/**
 * What each notebook search depth actually does.
 *
 * The ids come from `notebookDepthSchema` (@gruenerator/contracts); the numbers
 * stay here because they are server-side tuning, not part of the wire contract.
 *
 * `deep` and `ultra` both keep 100 passages since 06.10.2026 — the Qdrant
 * ceiling per query; they differ in reformulations, threshold and history.
 * `fast` is deliberately byte-identical to the pre-tier behaviour — the Grün-O-Mat surface runs on it (`mode: 'fast'` in
 * gruenOMatController) and is not part of this change.
 */
import { type NotebookDepth } from '@gruenerator/contracts';

import { type SearchParams } from './systemCollectionsConfig.js';

export interface NotebookDepthProfile {
  /** Per-collection Qdrant result limit. */
  searchLimit: number;
  /**
   * Floor for the pre-filter recall window. A collection configured with a
   * larger `recallLimit` keeps its own — the tier raises, never lowers.
   */
  recallLimitFloor: number;
  /** Similarity cut, applied both inside search and when sorting candidates. */
  threshold: number;
  /** Candidates kept after dedup + sort, before reranking. */
  sortLimit: { single: number; multi: number };
  /** Candidates handed to the cross-encoder. */
  rerankInput: number;
  /** Passages that survive into the prompt. */
  rerankOutput: number;
  /**
   * Ausgabe-Wunsch der Stufe, keine Zusage. Liegt er über der Decke des
   * Modells, das die Lane auflöst, kürzt `clampToModelOutputLimit`
   * (services/ai/modelOutputLimits.ts) darauf herunter — Mistral
   * Medium 3.5 nimmt hier höchstens 16.384 an, andere Lanes mehr. Die Zahl darf
   * deshalb großzügig bleiben; sie ist auf die Stufe getunt, nicht auf das
   * Modell.
   */
  maxOutputTokens: number;
  /** Shrink the answer to match a shrunken context. */
  conciseAnswer: boolean;
  /**
   * How many formulations of the question are searched in parallel — 1 means
   * the user's wording only, no reformulation.
   */
  queryVariants: number;
  /**
   * Whether the tier puts the conversation history in the PROMPT. `false`
   * drops incoming history EXPLICITLY from the prompt (single-shot, the
   * behaviour every tier had before) — this is what neutralises the
   * chat-mode client, which has always sent the full unpruned thread to this
   * endpoint. `true` runs the budgeted path for the prompt: turn-granular
   * trimming, carried citations. Independent of this flag: `queryRewrite`
   * below, which reads history to rewrite the search query regardless of
   * whether it ends up in the prompt.
   */
  history: boolean;
  /**
   * Ob eine Folgefrage vor der Suche gegen den Verlauf zu einer
   * eigenständigen Anfrage umgeschrieben wird. Unabhängig von `history`:
   * `deep` schreibt um, gibt dem Modell aber keinen Verlauf — die Suche
   * braucht das Thema, der Prompt nicht die alten Turns.
   */
  queryRewrite: boolean;
}

const PROFILES: Record<NotebookDepth, NotebookDepthProfile> = {
  fast: {
    searchLimit: 30,
    recallLimitFloor: 50,
    threshold: 0.35,
    sortLimit: { single: 30, multi: 40 },
    rerankInput: 20,
    rerankOutput: 10,
    maxOutputTokens: 20000,
    conciseAnswer: true,
    queryVariants: 1,
    history: false,
    queryRewrite: false,
  },
  // 100 ist die Decke der Qdrant-Suche je Abfrage. Gemessen 06.10.2026 an 23
  // LV-Fragen (evals/answer/model-eval-2026-10-06.md): gegen 40/18 gewann
  // diese Tiefe 22:0 (Gemma) und 20:1 (Large 4); fehlende Kernaspekte fielen
  // von 16 auf 2. Preis: ~100 s statt ~57 s bis zur fertigen Antwort mit Gemma.
  deep: {
    searchLimit: 100,
    recallLimitFloor: 100,
    threshold: 0.35,
    sortLimit: { single: 100, multi: 100 },
    rerankInput: 100,
    rerankOutput: 100,
    maxOutputTokens: 40000,
    conciseAnswer: false,
    queryVariants: 1,
    history: false,
    queryRewrite: true,
  },
  ultra: {
    searchLimit: 100,
    recallLimitFloor: 150,
    threshold: 0.28,
    sortLimit: { single: 100, multi: 100 },
    rerankInput: 100,
    rerankOutput: 100,
    maxOutputTokens: 40000,
    conciseAnswer: false,
    queryVariants: 3,
    history: true,
    queryRewrite: true,
  },
};

export function getNotebookDepthProfile(depth: NotebookDepth): NotebookDepthProfile {
  return PROFILES[depth];
}

/**
 * Das Profil eines notebook-gebundenen CHAT-Turns.
 *
 * Der Chat hat keinen Tiefen-Regler. Bis 06.10.2026 fuhr er dieselben Zahlen
 * wie die Notebook-Stufe „Mittel" (`deep`); seit die auf 100 Passagen gewachsen
 * ist, hat er eigene: sein Prompt trägt höchstens `MAX_SOURCES` Quellen, und
 * `executeDirectSearch` holt höchstens `OVERFETCH_CEILING` — die Kette prüft
 * chatNotebookDepth.vitest.ts. Die Zahlen sind die bisherigen `deep`-Werte.
 *
 * Eine Konstante für beide Lesestellen, damit `searchNode` und `rerankNode`
 * nicht auseinanderlaufen können: ein Reranker-Fenster unter dem Suchergebnis
 * wirft bezahlte Treffer weg, eines darüber ist tote Rechnung.
 */
type ChatNotebookProfile = Pick<
  NotebookDepthProfile,
  'searchLimit' | 'sortLimit' | 'rerankInput' | 'rerankOutput'
>;

const CHAT_NOTEBOOK_PROFILE: ChatNotebookProfile = {
  searchLimit: 40,
  sortLimit: { single: 40, multi: 60 },
  rerankInput: 40,
  rerankOutput: 18,
};

export function getChatNotebookProfile(): ChatNotebookProfile {
  return CHAT_NOTEBOOK_PROFILE;
}

/**
 * Widen a collection's search parameters to the tier. `recallLimit` takes the
 * larger of the two so a collection tuned for deeper recall keeps it, and
 * `qualityMin` — the per-collection quality floor, a different axis from the
 * similarity cut — is left alone.
 */
export function applyDepthProfile(
  params: SearchParams,
  profile: NotebookDepthProfile | undefined
): SearchParams {
  if (!profile) return params;
  return {
    ...params,
    limit: profile.searchLimit,
    threshold: profile.threshold,
    recallLimit: Math.max(params.recallLimit, profile.recallLimitFloor),
  };
}
