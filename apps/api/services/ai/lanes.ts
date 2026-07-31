/**
 * Which model answers which kind of request.
 *
 * One registry, replacing an if/else chain of ~23 `type === '…'` comparisons in
 * `services/providers/providerSelector.ts`. Same decisions, readable as a table:
 * you can see at a glance that every sharepic lane is Mistral Medium and every
 * legislative lane is verdigado, which was the point of the chain and was the
 * one thing it did not show.
 *
 * SCOPE. This is the routing table only. Sampling stays in `services/ai/config.ts`
 * and is NOT folded in here, despite both being keyed by the same `type` string:
 * `getGenerationConfig` branches on the platform list and sniffs the system
 * prompt for formal keywords, so it is a function of the whole request, not a
 * row. Copying that branching into static rows would duplicate it, which is the
 * problem this file exists to reduce. `generate.ts` composes the two.
 *
 * NOT a `z.enum` in `packages/contracts`: lane ids never cross the wire. Routes
 * derive them from their own configuration, never from a request body. The one
 * neighbour that IS wire-facing — the playground's explicit provider/model — is
 * an override and keeps its existing contract schema.
 */

import { intermediateLane } from './intermediateLanes.js';

import type { ProviderName } from './providers.js';

/** @see services/ai/intermediateLanes.ts */
const LANE = intermediateLane('standard');

export interface LaneConfig {
  readonly provider: ProviderName;
  /** `null` = the provider's own default (see `getDefaultModel`). */
  readonly model: string | null;
  /**
   * How `aiObject` asks this lane for structure. `tool` is a forced tool call,
   * which is the only strategy proven against all four providers here; `native`
   * would use the SDK's `generateObject`. Per-lane so one can be switched and
   * measured without a repo-wide decision.
   */
  readonly structuredMode: 'tool' | 'native';
}

const MISTRAL_MEDIUM = 'mistral-medium-2604';
const VERDIGADO_PRO = 'verdigado-pro';
/** Gemma 4 — named explicitly because Regolo's DEFAULT is qwen, which policy excludes. */
const GEMMA_4 = 'gemma4-31b';

/**
 * Every routed lane. A `type` that is not here answers on `default`, and
 * `resolveLane` says so out loud — the silent version of that fallthrough is
 * what left `website` on the litellm lane for the life of the feature while its
 * route believed it had asked for Mistral.
 */
export const AI_LANES = {
  /**
   * Anything unrouted.
   *
   * Mistral Medium 3.5 since the 2026-07-31 GPT-OSS wind-down. GPT-OSS was the
   * worst possible catch-all for this slot: every lane here declares
   * `structuredMode: 'tool'`, and GPT-OSS answers a forced tool call with
   * prose — the exact failure the artefact note below records, where two
   * attempts came back `stop_reason=stop` with no tool call and a production
   * PDF generation died. The artefact lanes were moved to Medium 3.5 for that
   * reason; the fallthrough now lands somewhere that can satisfy the mode it
   * promises.
   */
  default: { provider: 'mistral', model: MISTRAL_MEDIUM, structuredMode: 'tool' },

  // — Notebook / QA. Mistral Medium 3.5 is the notebook default.
  notebook_enrich: { provider: 'mistral', model: MISTRAL_MEDIUM, structuredMode: 'tool' },
  qa_draft: { provider: 'mistral', model: MISTRAL_MEDIUM, structuredMode: 'tool' },
  qa_draft_fast: { provider: 'mistral', model: MISTRAL_MEDIUM, structuredMode: 'tool' },
  qa_tools: { provider: 'mistral', model: MISTRAL_MEDIUM, structuredMode: 'tool' },
  qa_planner: { provider: 'mistral', model: MISTRAL_MEDIUM, structuredMode: 'tool' },
  qa_repair: { provider: 'mistral', model: MISTRAL_MEDIUM, structuredMode: 'tool' },

  // — Fertige Texte. Gemma 4 schreibt das beste Deutsch; es sitzt aus demselben
  //   Grund im Synth-Slot des Chat-Loops. Siehe TEXT_TYPES in
  //   services/providers/providerSelector.ts.
  //
  //   Die Anträge saßen auf GPT-OSS mit der Notiz "reasoning is handled via
  //   reasoningEffort". Auf DIESEM Pfad stimmte das nie: der Worker-Pool
  //   (workers/providers/execute.ts) reicht keine Reasoning-Option durch. Im
  //   Streaming-Pfad (agents/langgraph/streamingProcessor.ts) gilt sie und
  //   wird dort providerspezifisch gesetzt.
  antrag: { provider: 'regolo', model: GEMMA_4, structuredMode: 'tool' },
  antrag_simple: { provider: 'regolo', model: GEMMA_4, structuredMode: 'tool' },
  kleine_anfrage: { provider: 'regolo', model: GEMMA_4, structuredMode: 'tool' },
  grosse_anfrage: { provider: 'regolo', model: GEMMA_4, structuredMode: 'tool' },
  universal: { provider: 'regolo', model: GEMMA_4, structuredMode: 'tool' },
  leichte_sprache: { provider: 'regolo', model: GEMMA_4, structuredMode: 'tool' },
  custom_prompt: { provider: 'regolo', model: GEMMA_4, structuredMode: 'tool' },
  protokoll: { provider: 'regolo', model: GEMMA_4, structuredMode: 'tool' },
  rede: { provider: 'regolo', model: GEMMA_4, structuredMode: 'tool' },
  wahlprogramm: { provider: 'regolo', model: GEMMA_4, structuredMode: 'tool' },
  buergeranfragen: { provider: 'regolo', model: GEMMA_4, structuredMode: 'tool' },
  social: { provider: 'regolo', model: GEMMA_4, structuredMode: 'tool' },
  social_post_generation: { provider: 'regolo', model: GEMMA_4, structuredMode: 'tool' },
  social_post_edit: { provider: 'regolo', model: GEMMA_4, structuredMode: 'tool' },
  subtitler_social: { provider: 'regolo', model: GEMMA_4, structuredMode: 'tool' },

  // — Candidate-site content. Mistral, which the route always intended; it used
  //   to say so with a top-level `provider` that selected the adapter without
  //   selecting a matching model.
  website: { provider: 'mistral', model: MISTRAL_MEDIUM, structuredMode: 'tool' },

  // — Artefakte über erzwungene Tool-Calls (generateStructured). These had no
  //   lane at all, so both tables put them on `default` — GPT-OSS, which
  //   answers a forced tool call with prose. That killed a PDF generation in
  //   production: two attempts, both stop_reason=stop, no tool call.
  doc_generation: { provider: 'mistral', model: MISTRAL_MEDIUM, structuredMode: 'tool' },
  board_generation: { provider: 'mistral', model: MISTRAL_MEDIUM, structuredMode: 'tool' },
  canvas_ai_suggest: { provider: 'mistral', model: MISTRAL_MEDIUM, structuredMode: 'tool' },

  // — Fast helper tasks. Alle auf der `standard`-Stufe: kurze Ausgabe, aber
  //   nutzersichtbare Latenz. Ein Edit an der Stufe bewegt alle fünf.
  image_picker: {
    provider: LANE.provider,
    model: LANE.model,
    structuredMode: 'tool',
  },
  antrag_question_generation: {
    provider: LANE.provider,
    model: LANE.model,
    structuredMode: 'tool',
  },
  antrag_qa_summary: {
    provider: LANE.provider,
    model: LANE.model,
    structuredMode: 'tool',
  },
  gruenerator_ask: {
    provider: LANE.provider,
    model: LANE.model,
    structuredMode: 'tool',
  },
  gruenerator_ask_grundsatz: {
    provider: LANE.provider,
    model: LANE.model,
    structuredMode: 'tool',
  },

  // — Sharepics: short creative German. Mistral Medium 3.5 writes noticeably
  //   better slogans and quotes here than GPT-OSS.
  sharepic_dreizeilen: { provider: 'mistral', model: MISTRAL_MEDIUM, structuredMode: 'tool' },
  sharepic_zitat: { provider: 'mistral', model: MISTRAL_MEDIUM, structuredMode: 'tool' },
  sharepic_zitat_pure: { provider: 'mistral', model: MISTRAL_MEDIUM, structuredMode: 'tool' },
  sharepic_headline: { provider: 'mistral', model: MISTRAL_MEDIUM, structuredMode: 'tool' },
  sharepic_info: { provider: 'mistral', model: MISTRAL_MEDIUM, structuredMode: 'tool' },
  sharepic_veranstaltung: { provider: 'mistral', model: MISTRAL_MEDIUM, structuredMode: 'tool' },
  sharepic_simple: { provider: 'mistral', model: MISTRAL_MEDIUM, structuredMode: 'tool' },
  sharepic_slider: { provider: 'mistral', model: MISTRAL_MEDIUM, structuredMode: 'tool' },
} as const satisfies Record<string, LaneConfig>;

export type LaneId = keyof typeof AI_LANES;

export function isLaneId(id: string): id is LaneId {
  return Object.prototype.hasOwnProperty.call(AI_LANES, id);
}

const warnedUnknown = new Set<string>();

/**
 * The lane for a `type` string.
 *
 * Tolerant because one caller is genuinely dynamic — `PromptProcessor`'s
 * `routeType` comes from prompt-config JSON — but noisy about it, once per
 * unknown id. An unrouted type still WORKS; it just runs on `default`, and the
 * point of the log is that somebody chose that by not choosing.
 */
export function resolveLane(id: string): LaneId {
  if (isLaneId(id)) return id;
  if (!warnedUnknown.has(id)) {
    warnedUnknown.add(id);
    console.warn(`[lanes] No lane for type "${id}" — answering on the default lane.`);
  }
  return 'default';
}

/**
 * Provider and model for a lane, with the environment override applied.
 *
 * `MAIN_LLM_OVERRIDE` forces one model everywhere and infers its provider from
 * the name — an operator escape hatch that predates the registry and keeps
 * working.
 */
export function laneTarget(
  lane: LaneId,
  overrides: { model?: string | undefined } = {},
  environment: NodeJS.ProcessEnv = process.env
): { provider: ProviderName; model: string | null } {
  const row = AI_LANES[lane];

  const mainOverride = environment.MAIN_LLM_OVERRIDE;
  if (mainOverride) {
    return { provider: providerForModel(mainOverride), model: mainOverride };
  }

  return { provider: row.provider, model: overrides.model ?? row.model };
}

/**
 * Guess a provider from a model name. Only used for `MAIN_LLM_OVERRIDE`, where
 * an operator names a model and not a lane.
 */
export function providerForModel(modelName = ''): ProviderName {
  const name = String(modelName || '').toLowerCase();
  if (
    name.includes('mistral-medium-') ||
    name.includes('mistral-large-') ||
    name.includes('mistral-small-')
  ) {
    return 'mistral';
  }
  if (name.includes('gpt-') || name.includes('openai')) return 'litellm';
  if (name.includes('mistral') || name.includes('mixtral')) return 'litellm';
  if (name.includes('llama') || name.includes('meta-llama')) return 'regolo';
  if (name.startsWith('regolo/') || name.includes('regolo')) return 'regolo';
  return 'mistral';
}

/**
 * Failover order after the primary. Two chains, matching what
 * `providerFallback` runs today: sharepics lead with Mistral because short
 * creative German is what it is best at, everything else leads with the
 * cheapest capable lane.
 */
export function laneFallback(lane: LaneId): readonly ProviderName[] {
  const primary = AI_LANES[lane].provider;
  const chain = lane.startsWith('sharepic_')
    ? (['mistral', 'litellm', 'regolo'] as const)
    : (['litellm', 'regolo', 'mistral'] as const);
  return chain.filter((p) => p !== primary);
}
