/**
 * Which model answers which kind of request.
 *
 * One registry. It replaced an if/else chain of ~23 `type === '…'` comparisons
 * (`providerSelector.ts`, deleted). Same decisions, readable as a table:
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
 * derive them from their own configuration, never from a request body.
 */

import {
  GEMMA_31B_ALTERNATE,
  GEMMA_31B_ON_CORTECS,
  GEMMA_31B_ON_MELIOUS_ECO,
  GEMMA_31B_ON_MELIOUS_SPEED,
  GEMMA_31B_PRIMARY,
} from './gemmaHosts.js';
import { intermediateLane } from './intermediateLanes.js';
import { MELIOUS_WIDE_MODEL } from './meliousThinkingFetch.js';

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

/** Mistral Large 4 — seit 12.10.2026 anstelle von Medium 3.5 (`mistral-medium-2604`). */
const MISTRAL_LARGE = 'mistral-large-4';
/** Gemma 4, dichtes 31B — Provider UND Modellname kommen aus `gemmaHosts.ts`,
 *  der einen Stelle, die den Host wählt. Nicht hier benennen: die beiden Hosts
 *  schreiben denselben Modellnamen verschieden, ein hart notierter Name
 *  überlebt den nächsten Wechsel als 404. */
const GEMMA_4 = GEMMA_31B_PRIMARY.model;

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
  default: { provider: 'mistral', model: MISTRAL_LARGE, structuredMode: 'tool' },

  // — Notebook / QA. Gemma 4 seit 12.10.2026 (Kosten), vorher Mistral Medium 3.5;
  //   Mistral bleibt über `laneFallback` der letzte Ausweich.
  notebook_enrich: { provider: GEMMA_31B_PRIMARY.provider, model: GEMMA_4, structuredMode: 'tool' },
  qa_draft: { provider: GEMMA_31B_PRIMARY.provider, model: GEMMA_4, structuredMode: 'tool' },
  qa_draft_fast: { provider: GEMMA_31B_PRIMARY.provider, model: GEMMA_4, structuredMode: 'tool' },
  qa_tools: { provider: GEMMA_31B_PRIMARY.provider, model: GEMMA_4, structuredMode: 'tool' },
  qa_planner: { provider: GEMMA_31B_PRIMARY.provider, model: GEMMA_4, structuredMode: 'tool' },
  qa_repair: { provider: GEMMA_31B_PRIMARY.provider, model: GEMMA_4, structuredMode: 'tool' },

  // — Bundestags-Fragen (services/bundestag/qa): Plan der Suche, Lesen eines
  //   Dokumentfensters, Antwort aus den belegten Punkten. Gemma 4 wie die QA-Lanes.
  bundestag_plan: { provider: GEMMA_31B_PRIMARY.provider, model: GEMMA_4, structuredMode: 'tool' },
  //   `bundestag_read` auf `:speed` (Entscheidung 09.11.2026, #5581): dieselben Gewichte,
  //   Median je Fenster 2,9 s statt 10,3 s, Summe über 7 Dokumente 78 s statt 238 s;
  //   `:balanced` streute von 3 bis 78 s bei gleichen Tokens. Der Chat-Loop bleibt auf `:balanced`.
  bundestag_read: {
    provider: GEMMA_31B_ON_MELIOUS_SPEED.provider,
    model: GEMMA_31B_ON_MELIOUS_SPEED.model,
    structuredMode: 'tool',
  },
  bundestag_answer: {
    provider: GEMMA_31B_PRIMARY.provider,
    model: GEMMA_4,
    structuredMode: 'tool',
  },

  // — KI-Schnitt (services/videoAi/): eine Lane für alle vier Schritte, das
  //   `label` des Aufrufs unterscheidet sie in Logs und Nutzung. `:speed` wie
  //   `bundestag_read`. Stufe A (decideCut.ts): welche Sätze des Rohmaterials
  //   in welcher Reihenfolge, mit Reasoning 8–11 s; 15 min Rohmaterial sind
  //   ~12k Token, über der Schwelle, ab der `:balanced` am 60-s-Gateway
  //   scheitert (Spike vom 10.11.2026, apps/api/evals/video-ai/spike-2026-11-10.md,
  //   Abschnitt 5). Kontaktbögen (describeFrames.ts): ein 3×3-Raster pro
  //   Aufruf, ohne Reasoning, 3–4 s und ~530 Prompt-Token (Spike, Abschnitt 3).
  //   Gestaltung (decideDesign.ts): Titel, Bauchbinde, Einblendungen auf die
  //   fertige Zeitleiste. Korrekturrunde (reviseEdl.ts): Feedback in eigenen
  //   Worten → feste Ops auf den aktuellen Plan, mit Reasoning wie Stufe A.
  video_ai: {
    provider: GEMMA_31B_ON_MELIOUS_SPEED.provider,
    model: GEMMA_31B_ON_MELIOUS_SPEED.model,
    structuredMode: 'tool',
  },

  // — Fertige Texte. Gemma 4 schreibt das beste Deutsch; es sitzt aus demselben
  //   Grund im Synth-Slot des Chat-Loops.
  //
  //   Die Anträge saßen auf GPT-OSS mit der Notiz "reasoning is handled via
  //   reasoningEffort". Auf DIESEM Pfad stimmte das nie: der Ausführungspfad
  //   (services/ai/execution/execute.ts) reicht keine Reasoning-Option durch. Im
  //   Streaming-Pfad (agents/langgraph/streamingProcessor.ts) gilt sie und
  //   wird dort providerspezifisch gesetzt.
  antrag: { provider: GEMMA_31B_PRIMARY.provider, model: GEMMA_4, structuredMode: 'tool' },
  antrag_simple: { provider: GEMMA_31B_PRIMARY.provider, model: GEMMA_4, structuredMode: 'tool' },
  kleine_anfrage: { provider: GEMMA_31B_PRIMARY.provider, model: GEMMA_4, structuredMode: 'tool' },
  grosse_anfrage: { provider: GEMMA_31B_PRIMARY.provider, model: GEMMA_4, structuredMode: 'tool' },
  universal: { provider: GEMMA_31B_PRIMARY.provider, model: GEMMA_4, structuredMode: 'tool' },
  leichte_sprache: { provider: GEMMA_31B_PRIMARY.provider, model: GEMMA_4, structuredMode: 'tool' },
  custom_prompt: { provider: GEMMA_31B_PRIMARY.provider, model: GEMMA_4, structuredMode: 'tool' },
  protokoll: { provider: GEMMA_31B_PRIMARY.provider, model: GEMMA_4, structuredMode: 'tool' },
  rede: { provider: GEMMA_31B_PRIMARY.provider, model: GEMMA_4, structuredMode: 'tool' },
  wahlprogramm: { provider: GEMMA_31B_PRIMARY.provider, model: GEMMA_4, structuredMode: 'tool' },
  buergeranfragen: { provider: GEMMA_31B_PRIMARY.provider, model: GEMMA_4, structuredMode: 'tool' },
  social: { provider: GEMMA_31B_PRIMARY.provider, model: GEMMA_4, structuredMode: 'tool' },
  social_post_edit: {
    provider: GEMMA_31B_PRIMARY.provider,
    model: GEMMA_4,
    structuredMode: 'tool',
  },
  subtitler_social: {
    provider: GEMMA_31B_PRIMARY.provider,
    model: GEMMA_4,
    structuredMode: 'tool',
  },
  // Grünerator Voice: the spoken script a person edits before synthesis. Same
  // slot as `rede` — it is finished German prose, only meant for the ear.
  voice_script: { provider: GEMMA_31B_PRIMARY.provider, model: GEMMA_4, structuredMode: 'tool' },

  // — Candidate-site content. Gemma 4 on Melious `:eco` since 25.11.2026, instead
  //   of Mistral Large 4 (€ per M tokens 0.25/0.50 against 1.156/3.553, see the
  //   price table in gemmaHosts.ts). Measured 25.11.2026 with the real prompt,
  //   schema and validator, forced tool call as `aiObject` sends it, 5
  //   descriptions (one de-AT) × 2: 10/10 valid, 11–22 s, ~0.055 ct per page.
  //   It streams the tool arguments in ~190 chunks, which the planned live build
  //   of the preview needs; Mistral sent the whole tool call as one chunk.
  //   Not `:speed`: in JSON mode it answered in a single chunk, keys sorted
  //   alphabetically, and one run looped to the token limit.
  website: { provider: 'melious', model: GEMMA_31B_ON_MELIOUS_ECO, structuredMode: 'tool' },

  // — Flyer text → structured analysis. Gemma 4 on Cortecs since 25.11.2026, named
  //   by host on purpose, not via GEMMA_31B_ALTERNATE: Melious (`:eco` and
  //   `:balanced`) answered this tool call with HTTP 503 for every flyer without
  //   an e-mail address (9/9: 7 on `:eco`, 2 on `:balanced`; the same text with
  //   an address went through), while
  //   Cortecs answered 8/8 valid, 10–22 s, ~0.03 ct per flyer (Mistral Large 4:
  //   6.5–70 s, 0.3–0.7 ct). Swapping primary and alternate must not move this
  //   row back onto Melious.
  'flyer-analysis': {
    provider: GEMMA_31B_ON_CORTECS.provider,
    model: GEMMA_31B_ON_CORTECS.model,
    structuredMode: 'tool',
  },

  // — Artefakte über erzwungene Tool-Calls (aiObject). These had no
  //   lane at all, so both tables put them on `default` — GPT-OSS, which
  //   answers a forced tool call with prose. That killed a PDF generation in
  //   production: two attempts, both stop_reason=stop, no tool call.
  //
  //   `doc_generation` liegt seit dem 03.08.2026 NICHT auf Mistral: Medium 3.5
  //   rief das Tool in keinem Lauf auf und lief ins Token-Limit, Gemma 4 rief
  //   `create_pdf_document` / `create_presentation` in 10 von 10 Läufen sauber
  //   auf (gemessen auf GreenPT). Seit 19.11.2026 auf dem Gemma-Primär statt
  //   GreenPT: dort riss der erste Versuch lokal 3 von 3 Mal das 60-s-Budget
  //   (#5842), Melious lieferte danach in 10–14 s. Das grössere Output-Budget in
  //   services/ai/config.ts gehört weiter dazu.
  doc_generation: { provider: GEMMA_31B_PRIMARY.provider, model: GEMMA_4, structuredMode: 'tool' },
  board_generation: { provider: 'mistral', model: MISTRAL_LARGE, structuredMode: 'tool' },
  canvas_ai_suggest: { provider: 'mistral', model: MISTRAL_LARGE, structuredMode: 'tool' },
  // — Editor-Op-Planer (board/sheet/presentation), der `edit_document`-
  //   Werkzeug im agentischen Loop (#3426). Erzwungener Tool-Call wie die
  //   Zeilen darüber; alle drei planten vorher auf einer privaten Kette
  //   (mistral → melious → cortecs), die diese Tabelle nicht so ausdrücken
  //   kann — `laneFallback` kennt nur die generische Kette und die
  //   Sharepic-Kette, beide filtern den Primär (hier mistral) heraus und
  //   liefern für DIESE drei Lanes dasselbe Ergebnis (cortecs, melious), nur
  //   in vertauschter Reihenfolge gegenüber der alten privaten Kette. Sheet
  //   und Presentation waren zuvor auf Mistral GEPINNT ohne Ausweichkette
  //   ("fail loudly" statt leise herabzustufen) — eine Lane hat dafür kein
  //   Feld, sie bekommen jetzt dieselbe generische Ausweichkette.
  editor_ops_board: { provider: 'mistral', model: MISTRAL_LARGE, structuredMode: 'tool' },
  editor_ops_sheet: { provider: 'mistral', model: MISTRAL_LARGE, structuredMode: 'tool' },
  editor_ops_presentation: { provider: 'mistral', model: MISTRAL_LARGE, structuredMode: 'tool' },

  // — Fast helper tasks. Alle auf der `standard`-Stufe: kurze Ausgabe, aber
  //   nutzersichtbare Latenz. Ein Edit an der Stufe bewegt alle fünf.
  // Ergebnis-Prüfung für Hintergrundläufe (#3221): kurzes JSON-Verdikt über
  // Aufgabe vs. Ergebnis, keine nutzersichtbare Latenz — kein Pinning nötig.
  background_verify: {
    provider: LANE.provider,
    model: LANE.model,
    structuredMode: 'tool',
  },
  image_picker: {
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
  sharepic_dreizeilen: { provider: 'mistral', model: MISTRAL_LARGE, structuredMode: 'tool' },
  sharepic_zitat: { provider: 'mistral', model: MISTRAL_LARGE, structuredMode: 'tool' },
  sharepic_zitat_pure: { provider: 'mistral', model: MISTRAL_LARGE, structuredMode: 'tool' },
  sharepic_headline: { provider: 'mistral', model: MISTRAL_LARGE, structuredMode: 'tool' },
  sharepic_info: { provider: 'mistral', model: MISTRAL_LARGE, structuredMode: 'tool' },
  sharepic_veranstaltung: { provider: 'mistral', model: MISTRAL_LARGE, structuredMode: 'tool' },
  sharepic_simple: { provider: 'mistral', model: MISTRAL_LARGE, structuredMode: 'tool' },
  sharepic_slider: { provider: 'mistral', model: MISTRAL_LARGE, structuredMode: 'tool' },

  // — Explainables: a source re-told in einfache Sprache as structured JSON.
  explainable: { provider: GEMMA_31B_PRIMARY.provider, model: GEMMA_4, structuredMode: 'tool' },

  // — Podcasts: a source re-told as a two-voice dialogue script.
  podcast_script: { provider: GEMMA_31B_PRIMARY.provider, model: GEMMA_4, structuredMode: 'tool' },

  // — Agent- und Rezept-Entwurf aus einer Beschreibung (`draftAgentSpec`,
  //   `draftRecipeSpec`, #4518). Gemma 4 statt Mistral Large 4, gemessen am
  //   15.10.2026 (je 6 Agent-Entwürfe): beide 6/6 ohne Ausweich oder
  //   Reparatur, Gemma 3–7 s statt 11–80 s und kürzere Rollen (~2,4k statt
  //   6–7k Zeichen beim langen Brief), ohne die erfundenen Beispielzitate, die
  //   Mistral in den systemRole schrieb.
  creator_draft: { provider: GEMMA_31B_PRIMARY.provider, model: GEMMA_4, structuredMode: 'tool' },

  // — Browser-Agent (`services/browser-agent`, browser-use): jeder Schritt
  //   trägt einen Screenshot im Prompt. `:speed` (infercom/DE, ~130k Fenster)
  //   gemessen; `:balanced` (FI-Knoten, ~45k) lief im Browser-Spike in
  //   Zeitüberschreitungen. Rückfall über `laneFallback` (cortecs, mistral).
  browser_agent: { provider: 'melious', model: MELIOUS_WIDE_MODEL, structuredMode: 'tool' },
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
  // Das DICHTE 31B ist die Cortecs-Seite: Primär von `heavy` und
  // `pruefung` und der Ausweich der Gemma-Antwortlane. Ohne diese Zeile fällt
  // der Name durch die ganze Kette bis zum `return 'mistral'` am Ende — es
  // gibt gar keinen generischen gemma-Test — und ein Operator bekäme einen 404
  // von einem Anbieter, der das Modell nicht führt.
  if (name === 'gemma-4-31b-it' || name === 'gemma-4-26b-a4b-it') return 'cortecs';
  if (
    name.includes('mistral-medium-') ||
    name.includes('mistral-large-') ||
    name.includes('mistral-small-')
  ) {
    return 'mistral';
  }
  // Bis zum 29.08.2026 zeigten diese beiden Zeilen auf `litellm`. Der Host ist
  // stillgelegt (./litellmRetired.ts); ein Operator, der hier einen Namen
  // setzt, bekäme sonst über den Umweg der Stilllegung IMMER dasselbe kleine
  // Modell — egal welchen Namen er geschrieben hat. Cortecs führt beide
  // Familien unter eigenen Kennungen.
  if (name.includes('gpt-') || name.includes('openai')) return 'cortecs';
  if (name.includes('mistral') || name.includes('mixtral')) return 'cortecs';
  return 'mistral';
}

/**
 * Failover order for everything that is not a sharepic. Exported because a
 * PINNED call has no lane row to derive it from (see `AiCall.pinned` in
 * `generate.ts`) and must not be routed through `resolveLane` to get one.
 *
 * Die beiden Gemma-Hosts führen, in der Reihenfolge von `gemmaHosts.ts`:
 * Primär zuerst, dann der andere Vertragspartner. Abgeleitet statt notiert,
 * damit ein Hostwechsel dort die Ketten hier mitnimmt — bis zum 28.10.2026
 * stand hier `'cortecs'` fest an erster Stelle, und der Wechsel auf Melious
 * hätte jede Mistral- und GreenPT-Lane weiter zuerst an Cortecs geschickt. Für
 * die Gemma-Lanes selbst ändert die Reihenfolge nichts: `laneFallback` filtert
 * den eigenen Primär heraus. Sie wirkt für die anderen, die Mistral-Lanes.
 *
 * Der Preis steht in `gemmaHosts.ts`: beide Hosts sind VORAUSBEZAHLT, ein
 * leeres Guthaben ist ein schneller Fehlschlag, und die verbleibenden Anbieter
 * stehen unverändert dahinter.
 *
 * ── 29.08.2026: `litellm` ist raus, und das ist der Kern von #3064 ──
 *
 * Ein Ausweichglied antwortet auf dem EIGENEN Standardmodell des Anbieters
 * (siehe `runChain` in ./generate.ts), nicht auf dem des Primärs. Für litellm
 * war das `verdigado-pro`, hinter dem am Proxy `gpt-oss:120b-ctx128k` liegt.
 * Jede Lane mit kleinem Ausgabebudget, die bis hierher durchfiel, landete also
 * auf einem Denkmodell, dessen Denk-Tokens gegen `max_tokens` zählen — der
 * Thread-Titel aus #3064 bat um 64 Tokens und bekam 64 Tokens Vorrede.
 *
 * Ein Auffangort, der die Anfrage nicht beantworten KANN, ist kein Auffangort.
 * Und einen anderen hatte der Proxy nicht: sein zweiter Alias
 * (`verdigado-think`) denkt ebenfalls, unabschaltbar.
 */
export const GENERIC_FALLBACK: readonly ProviderName[] = [
  GEMMA_31B_PRIMARY.provider,
  GEMMA_31B_ALTERNATE.provider,
  'mistral',
];

/**
 * Failover order after the primary. Two chains: sharepics lead with Mistral
 * because short creative German is what it is best at, everything else leads
 * with the fastest capable lane.
 */
export function laneFallback(lane: LaneId): readonly ProviderName[] {
  const primary = AI_LANES[lane].provider;
  const chain = lane.startsWith('sharepic_')
    ? (['mistral', GEMMA_31B_PRIMARY.provider, GEMMA_31B_ALTERNATE.provider] as const)
    : GENERIC_FALLBACK;
  return chain.filter((p) => p !== primary);
}
