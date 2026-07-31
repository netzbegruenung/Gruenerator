/**
 * Centralized provider selection and model override logic
 * Handles routing between Mistral, LiteLLM, and other providers
 */

import { INTERMEDIATE_MODEL } from '../ai/providers.js';

import type {
  ProviderName,
  ModelName,
  ProviderOptions,
  RequestMetadata,
  ProviderResult,
} from './types.js';

/**
 * Check if a model name is compatible with LiteLLM
 */
export function isLiteLLMCompatibleModel(modelName: string = ''): boolean {
  const name = String(modelName || '').toLowerCase();
  // LiteLLM models are the official verdigado-* aliases, gpt-oss prefixes,
  // or mistral/mixtral variants. Exclude Mistral API models (mistral-medium-2604, etc.)
  if (name.includes('verdigado')) {
    return true;
  }
  if (name.includes('gpt-oss') || name.includes('gpt-4') || name.includes('gpt-3')) {
    return true;
  }
  if (name.includes('mixtral') && !name.includes('-latest')) {
    return true;
  }
  // Mistral API models are NOT litellm compatible
  if (name.includes('mistral-')) {
    return false;
  }
  return false;
}

/**
 * Infer provider from model name patterns
 */
export function determineProviderFromModel(modelName: string = ''): ProviderName {
  const name = String(modelName || '').toLowerCase();
  // Mistral API models (mistral-large, mistral-small)
  if (
    name.includes('mistral-medium-') ||
    name.includes('mistral-large-') ||
    name.includes('mistral-small-')
  ) {
    return 'mistral';
  }
  // OpenAI-compatible models via LiteLLM
  if (name.includes('gpt-') || name.includes('openai')) {
    return 'litellm';
  }
  // Mixtral models via LiteLLM
  if (name.includes('mistral') || name.includes('mixtral')) {
    return 'litellm';
  }
  // Llama models via Regolo (hosts Llama-3.3-70B-Instruct)
  if (name.includes('llama') || name.includes('meta-llama')) {
    return 'regolo';
  }
  // Regolo-prefixed models
  if (name.startsWith('regolo/') || name.includes('regolo')) {
    return 'regolo';
  }
  return 'mistral';
}

interface SelectProviderParams {
  type: string;
  options?: ProviderOptions;
  metadata?: RequestMetadata;
  env?: NodeJS.ProcessEnv;
}

/**
 * Erstellung läuft nicht auf einem Modell, sondern auf ZWEI — getrennt danach,
 * was das Modell können muss.
 *
 * Beide Mengen lagen vorher auf dem Basis-Default litellm/verdigado-pro
 * (GPT-OSS 120B), und für beide ist das falsch, aber aus verschiedenen
 * Gründen:
 *
 *  - STRUCTURE_TYPES treiben das Modell durch einen ERZWUNGENEN TOOL-CALL
 *    (generateStructured), und GPT-OSS macht keinen. Ein PDF ist in Produktion
 *    zweimal mit `stop_reason=stop` und Prosa statt Tool-Call gescheitert; der
 *    Repo sperrt dieses Modell bereits als Synth-Lane wegen "verified
 *    tool-call fail" (AVOID_AS_SYNTH, routes/chat/agents/autoPolicy.ts).
 *    → Mistral Medium 3.5, dasselbe Modell, das sheetAiService dafür pinnt.
 *
 *  - TEXT_TYPES liefern FERTIGE TEXTE an Nutzer*innen. Da zählt nur, wer das
 *    beste Deutsch schreibt, und das ist Gemma 4 — deshalb sitzt es schon im
 *    Synth-Slot des Chat-Loops (LOOP_SYNTH_PRIMARY) und in der Gemma-Lane der
 *    Auto-Policy.
 *    → regolo/gemma4-31b.
 *
 * Bei den Anträgen ersetzt das einen bewussten GPT-OSS-Pin mit der Notiz
 * "reasoning handled via reasoningEffort". Auf DIESEM Pfad galt sie nie: der
 * Worker-Pfad (workers/providers/execute.ts) reicht überhaupt keine
 * Reasoning-Option durch. Im Streaming-Pfad
 * (agents/langgraph/streamingProcessor.ts) gilt sie — der nutzt diese Tabelle
 * und setzt die providerspezifische Option passend zum gewählten Provider.
 *
 * Ein Aufrufer darf weiterhin sein eigenes Modell benennen (`options.model`).
 */
const STRUCTURE_TYPES: ReadonlySet<string> = new Set([
  // Artefakte über erzwungene Tool-Calls
  'doc_generation', // PDF, Präsentation, Sheet, Dokument, Aufgabenlisten
  'board_generation',
  'canvas_ai_suggest', // Canvas-Vorschläge + Sharepic-/Social-Edits
  'website', // Kandidat*innen-Seiten: langes strukturiertes JSON
  // Sharepics — Slogans und Zitatzeilen, keine Fließtexte. Bleiben auf
  // Mistral: dass es hier "noticeably better German slogans/quotes" liefert,
  // war ein gemessener Befund, kein Default.
  'sharepic_dreizeilen',
  'sharepic_zitat',
  'sharepic_zitat_pure',
  'sharepic_headline',
  'sharepic_info',
  'sharepic_veranstaltung',
  'sharepic_simple',
  'sharepic_slider',
]);

/**
 * Fertige Texte. Die Liste folgt REASONING_BY_TYPE in
 * agents/langgraph/streamingProcessor.ts — das ist die bestehende Stelle, an
 * der der Repo erklärt, was ein Text-Grünerator ist.
 */
const TEXT_TYPES: ReadonlySet<string> = new Set([
  // Anträge und Anfragen
  'antrag',
  'antrag_simple',
  'kleine_anfrage',
  'grosse_anfrage',
  // Texte-Grüneratoren (/api/texte/*)
  'universal',
  'leichte_sprache',
  'custom_prompt',
  'protokoll',
  'rede',
  'wahlprogramm',
  'buergeranfragen',
  // Social
  'social',
  'social_post_generation',
  'social_post_edit',
  'subtitler_social',
]);

/** `mistral-medium-2604` === "Mistral Medium 3.5" (services/ai/modelDiscovery.ts). */
const STRUCTURE_MODEL = 'mistral-medium-2604';

/**
 * Gemma 4 lives on Regolo. Naming it explicitly is not optional: the Regolo
 * DEFAULT is `qwen3.5-122b`, and qwen is excluded by policy (AVOID_AS_SYNTH).
 *
 * The chat lane now agrees. `gemma-litellm` used to resolve to the slow
 * `verdigado-think` host, which is why this constant had to spell out the
 * Regolo pair; it points at these same weights on Regolo now (see
 * GEMMA_4_REGOLO in routes/chat/agents/providers.ts). The two paths no longer
 * disagree about where Gemma 4 runs.
 */
const TEXT_PROVIDER = 'regolo';
const TEXT_MODEL = 'gemma4-31b';

/**
 * Select provider and model given request context and environment
 * Handles type-based routing and environment overrides
 */
export function selectProviderAndModel({
  type,
  options = {},
  metadata = {},
  env = process.env,
}: SelectProviderParams): ProviderResult {
  // Base defaults — Mistral Medium 3.5 since the 2026-07-31 GPT-OSS wind-down.
  // Must stay in step with the `default` lane in services/ai/lanes.ts: the
  // parity test in lanes.vitest.ts asserts both tables answer an unrouted type
  // identically, and this is the half that used to say GPT-OSS.
  let provider: ProviderName = (options.provider as ProviderName) || 'mistral';
  let model: ModelName = options.model || STRUCTURE_MODEL;

  // Type-based defaults
  // Notebook enrichment - fast model
  if (type === 'notebook_enrich') {
    provider = 'mistral';
    model = options.model || 'mistral-medium-2604';
  }
  // Fast mode QA draft - fast model
  else if (type === 'qa_draft_fast') {
    provider = 'mistral';
    model = options.model || 'mistral-medium-2604';
  }
  // QA draft (final answer) — Mistral Medium 3.5, the notebook default
  else if (type === 'qa_draft') {
    provider = 'mistral';
    model = options.model || 'mistral-medium-2604';
  }
  // QA intermediate steps (planner, repair, tools) — fast model
  else if (type === 'qa_tools' || type === 'qa_planner' || type === 'qa_repair') {
    provider = 'mistral';
    model = options.model || 'mistral-medium-2604';
  }
  // Strukturierte Erstellung — Mistral Medium 3.5. Siehe STRUCTURE_TYPES.
  //
  // Historie, die sonst verloren geht: `website` steht hier, weil die Route
  // ein Top-Level `provider: 'mistral'` setzte — das wählt nur den ADAPTER,
  // das Modell kam weiter aus dieser Tabelle. Ohne Eintrag war es der
  // litellm-Default `verdigado-pro`, also reichte jede Anfrage der
  // Mistral-API einen verdigado-Alias, kassierte einen Fehler und wurde von
  // der Fallback-Kette gerettet — ein garantiert scheiternder Roundtrip pro
  // Request, unsichtbar hinter dem Fallback.
  else if (STRUCTURE_TYPES.has(type)) {
    provider = 'mistral';
    model = options.model || STRUCTURE_MODEL;
  }
  // Fertige Texte — Gemma 4. Siehe TEXT_TYPES.
  else if (TEXT_TYPES.has(type)) {
    provider = TEXT_PROVIDER;
    model = options.model || TEXT_MODEL;
  }
  // Fast helper tasks — Intermediate model (Regolo)
  else if (
    type === 'image_picker' ||
    type === 'antrag_question_generation' ||
    type === 'antrag_qa_summary' ||
    type === 'gruenerator_ask' ||
    type === 'gruenerator_ask_grundsatz'
  ) {
    provider = INTERMEDIATE_MODEL.provider;
    model = options.model || INTERMEDIATE_MODEL.model;
  }

  // Respect explicit provider at top-level if present (routes may set data.provider)
  if (options.explicitProvider) {
    provider = options.explicitProvider;
    // When explicitly using litellm, ensure model is litellm-compatible
    if (provider === 'litellm' && !isLiteLLMCompatibleModel(model)) {
      // Use explicitly provided litellm model or default
      model = isLiteLLMCompatibleModel(options.model) ? options.model! : 'verdigado-pro';
    }
  }

  // MAIN_LLM_OVERRIDE environment variable
  const mainLlmOverride = env.MAIN_LLM_OVERRIDE;
  if (mainLlmOverride) {
    model = mainLlmOverride;
    provider = determineProviderFromModel(mainLlmOverride);
  }

  return { provider, model };
}
