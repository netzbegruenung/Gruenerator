/**
 * Presets for `EVAL_RERANK_INSTRUCT` (see `runRetrievalEval.ts` header).
 *
 * `service` (no text) reproduces today's eval behaviour — the cross-encoder
 * service's own default instruct applies. `chat` is `rerankNode.ts:152-153`
 * verbatim minus the temporal hint (`hasTemporal` never applies outside the
 * chat graph). The rest are candidate instructs nobody has measured yet.
 */
export const RERANK_INSTRUCT_PRESETS = {
  service: null,
  chat:
    'Given a search query, retrieve relevant passages that answer the query.' +
    ' Prefer official party documents and verified sources over web snippets.',
  qa: 'Given a question, retrieve the passages that contain the answer.',
  de: 'Gegeben eine Frage zu grüner Politik in Deutschland oder Österreich, finde die Passagen, die die Frage beantworten.',
  'de-strict':
    'Bewerte nur, ob die Passage die Frage direkt beantwortet. Thematische Nähe ohne Antwort zählt nicht.',
} as const satisfies Record<string, string | null>;

export type RerankInstructPreset = keyof typeof RERANK_INSTRUCT_PRESETS;

export const DEFAULT_RERANK_INSTRUCT_PRESET: RerankInstructPreset = 'service';

export function isRerankInstructPreset(value: string): value is RerankInstructPreset {
  return Object.hasOwn(RERANK_INSTRUCT_PRESETS, value);
}
