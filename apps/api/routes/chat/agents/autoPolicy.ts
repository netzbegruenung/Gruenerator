/**
 * Auto-mode model & reasoning policy.
 *
 * `auto` used to be resolved on the CLIENT before the request went out, so it
 * only ever knew `threadMode` and the agent's `autoRoutingHint`. The intent —
 * the thing that actually describes the task — is produced by the classifier
 * on the server, one stage later. This module is where that decision now
 * lives: intent (+ complexity) in, model lane and reasoning strength out.
 *
 * It is deliberately PURE — no env access, no model instantiation, no imports
 * from `providers.ts`. That keeps it unit-testable without mocks and makes the
 * lane constants below importable by `providers.ts` without a cycle.
 *
 * ── What the auto model actually does per intent ────────────────────────────
 * The lane assignments below are not "which model is best" in the abstract.
 * For many intents the real work is delegated to a PINNED model and the auto
 * model only writes the surrounding chat text:
 *   - create_sheet / edit_current_doc → ops come from sheetAiService, pinned to
 *     mistral-medium-2604 with no fallback chain.
 *   - save_as_doc → document body comes from the `doc_generation` worker type.
 *   - sharepic → the answer text is a fixed template string in the router; the
 *     slogan comes from sharepicGenerationService. Auto has NO effect, so
 *     `sharepic` is intentionally absent from the table.
 *   - edit_sheet → same pinned planner as create_sheet; the answer text is a
 *     fixed template in handleSheetEdit. Also absent from the table.
 *   - summary → summarizeNode already runs on the `heavy` intermediate stage.
 *
 * ── Second-order effect ─────────────────────────────────────────────────────
 * `prefersUnifiedLoop` is true only for Mistral. Picking a Mistral lane
 * therefore also selects the UNIFIED loop (one model does tools + prose);
 * every other lane runs the split (fixed planner gathers, synth writes).
 */

import { getSystemAgent } from '@gruenerator/shared/agents';
import { type ChatIntentId, intentsWithDisposition } from '@gruenerator/shared/chat-intents';

import { GEMMA_31B_PRIMARY, GEMMA_31B_ON_CORTECS } from '../../../services/ai/gemmaHosts.js';

import { getPipelineAgent } from './pipelines/index.js';

import type { SearchIntent } from '@gruenerator/contracts';

/**
 * Reasoning strength. `off` means "do not think at all" — for the lanes that
 * stream reasoning by default this means routing around the reasoning path
 * entirely (see isReasoningStreamModel), not just a lower budget.
 *
 * The four steps are NOT equally expressive on every upstream:
 *   - gpt-oss has a native low/medium/high dial and honours all four;
 *   - Mistral's dial is BINARY ('high' | 'none' — anything else is a ZodError
 *     in @ai-sdk/mistral), so `low` collapses to off there. See
 *     `mistralReasoningOption` in responseStreamingService.
 *   - the remaining lanes only have on/off.
 */
export type ReasoningSetting = 'off' | 'low' | 'medium' | 'high';

export type Complexity = 'simple' | 'moderate' | 'complex';

/** A scalar applies to every complexity; the record grades by it. */
type ReasoningRule = ReasoningSetting | Record<Complexity, ReasoningSetting>;

/**
 * Keys into AVAILABLE_MODELS (providers.ts). Not the user-facing catalog.
 * Only the lanes the resolver can actually return; `gemma-4-26b` and `litellm`
 * left this union with the 07.08.2026 lane fold — they stay registered in
 * providers.ts for persisted thread ids and intermediate stages only.
 */
export type AutoLaneId = 'gemma-litellm' | 'mistral-medium-3.5';

interface AutoEntry {
  modelId: AutoLaneId;
  reasoning: ReasoningRule;
}

const graded = (
  simple: ReasoningSetting,
  moderate: ReasoningSetting,
  complex: ReasoningSetting
): Record<Complexity, ReasoningSetting> => ({ simple, moderate, complex });

/**
 * Gemma 4 31B (Regolo) is now the single content-answer lane. Lane A (Gemma 4
 * 26B, Scaleway) and Lane D (GPT-OSS) were folded into it on 07.08.2026: both
 * were picked for speed over a small/latency-critical prose share, and Gemma 4
 * on Regolo matches that latency (4.0s end to end, measured 2026-07-31)
 * without GPT-OSS's known weakness — it answers a forced tool call with prose,
 * which is what put a production PDF generation on the floor (see the artefact
 * note in services/ai/lanes.ts). `gemma-4-26b` and `litellm` stay registered in
 * providers.ts (persisted ids) but are no longer an auto-policy target.
 *
 * Der hier notierte degradierte Pfad („wenn Regolo ausfällt, landen Lane-A-
 * Intents auf verdigado-think, ~20 s bis zum ersten Token") gilt seit dem
 * 29.08.2026 nicht mehr: Verdigado bedient keine Lane mehr, und der Ausweich
 * ist der andere Gemma-Host (services/ai/gemmaHosts.ts). Dieselben Gewichte,
 * 1122 ms bis zum ersten Token statt 20 s.
 */
const GEMMA: AutoLaneId = 'gemma-litellm';
/** Mistral Medium 3.5. Where the model calls tools ITSELF and the unified loop
 *  should kick in, and — since 07.08.2026 — `compute`: narrating pre-computed
 *  figures without letting the writer invent its own arithmetic needs the more
 *  careful lane, not the speed one. See the `compute` entry below for the
 *  incident that motivated it. */
const MEDIUM: AutoLaneId = 'mistral-medium-3.5';

/**
 * Intents the auto model genuinely cannot influence — the ONLY legitimate
 * reason to be absent from the table.
 *
 * Being a hand-written `Record<string, AutoEntry>` meant "deliberately absent"
 * and "forgotten" looked identical, and both silently took DEFAULT_ENTRY. Two
 * intents were in fact forgotten (`hilfe`, `create_pdf`) and nobody could tell.
 * With the exemption named, the table is exhaustive over SearchIntent and a new
 * intent breaks the build until someone decides.
 */
export const AUTO_POLICY_EXEMPT = [
  'sharepic',
  // Ops come from sheetAiService, pinned to mistral-medium-2604 like
  // create_sheet's; the answer text is a fixed template in handleSheetEdit.
  'edit_sheet',
] as const satisfies readonly SearchIntent[];
type ExemptIntent = (typeof AUTO_POLICY_EXEMPT)[number];

/**
 * Exported for the drift guard in autoPolicy.vitest.ts.
 *
 * The type already forces completeness at compile time; the runtime guard used
 * to re-check it by resolving an unknown intent and comparing the RESULT to
 * each real intent's result. That only worked while DEFAULT_ENTRY's lane was
 * unique — pointing the default at Gemma 4 made two legitimate Gemma intents
 * look like silent fallthroughs. Checking the keys is what the guard actually
 * means.
 */
export const POLICY: Record<Exclude<SearchIntent, ExemptIntent>, AutoEntry> = {
  // ── Content answers: Gemma 4 (31B, Regolo) ──
  // Synth summarises tool output; the planner makes the MCP calls.
  mcp: { modelId: GEMMA, reasoning: 'off' },
  // summarizeNode runs on the `heavy` intermediate stage — same tier.
  summary: { modelId: GEMMA, reasoning: 'off' },
  chat_history: { modelId: GEMMA, reasoning: 'off' },
  // Narration over an artefact that is already IN CONTEXT (numbers, chart data,
  // scraped text). The premise is load-bearing: this lane REPEATS figures, it
  // does not produce them. A turn on 02.08.2026 broke it — one figure had been
  // computed, five were narrated — and the writer filled the gap with
  // arithmetic of its own, marking `42.000 + 84.000 = 120.000` as correct. Moved
  // to Mistral Medium on 07.08.2026 rather than staying on the shared prose
  // lane, so a regression here can't ride in on a change tuned for the other
  // content intents. The upstream fix still stands (computeArithmeticBatch
  // checks every claim, and the answer rule forbids ruling on anything outside
  // the checked block) — this is belt-and-braces, not a replacement for it.
  compute: { modelId: MEDIUM, reasoning: 'off' },
  chart: { modelId: GEMMA, reasoning: 'off' },
  scrape_url: { modelId: GEMMA, reasoning: 'off' },
  // Structured facts from system MCP sources — reporting, not writing.
  bahn: { modelId: GEMMA, reasoning: 'off' },
  wetter: { modelId: GEMMA, reasoning: 'off' },
  hotel: { modelId: GEMMA, reasoning: 'off' },
  reise: { modelId: GEMMA, reasoning: 'off' },
  umfragen: { modelId: GEMMA, reasoning: 'off' },
  // Reporting retrieved documentation sections back — the same shape as `mcp`
  // above (planner fetches, synth summarises).
  hilfe: { modelId: GEMMA, reasoning: 'off' },
  // `research_wrapper` lived here while a research turn only framed a
  // ready-made answer in two sentences. With the research/web merge the model
  // writes the whole answer from raw sources, so a research turn is ordinary
  // synthesis and takes the default lane like `web` does.

  // ── Prose over sources: Gemma 4 (31B, Regolo) ──
  //
  // `research` denkt auf `moderate` eine Stufe mehr als der Rest der Familie,
  // und der Grund ist NICHT der Intent, sondern die Materialmenge: der
  // Einzeldurchlauf leitet seinen Tier aus dem Intent ab
  // (`resolveSearchTier`: `research` → `gruendlich`, alle anderen →
  // `standard`), und das sind 10 statt 5 Quellen für dieselbe Schreibarbeit.
  //
  // Die Aussage gilt damit nur für den EINZELDURCHLAUF. In der Schleife
  // resolvet `web_search` seinen Tier selbst — Voreinstellung `gruendlich`,
  // und ein angefragtes `standard` wird dorthin hochgeklemmt (searchTools.ts,
  // `resolveSearchTier`) —, also bekommt dort JEDER Intent die 10 Quellen und
  // die Stufe steht ohne ihren Grund da. Gemessen wird sie trotzdem: der Loop
  // löst sein Synth-Modell über dieselbe Tabelle auf
  // (`agenticRespondService` → `resolveModel` → `resolveAutoSelection`), und
  // ein per Erwähnung erzwungener Turn behält seinen Intent.
  //
  // Bleibt (H-Regel: ein begründeter Anker wird dokumentiert, nicht
  // gleichgemacht). Wer sie fallen lässt, macht damit eine Aussage über den
  // Einzeldurchlauf — dort steht der Grund noch.
  research: { modelId: GEMMA, reasoning: graded('low', 'medium', 'medium') },
  search: { modelId: GEMMA, reasoning: graded('low', 'low', 'medium') },
  web: { modelId: GEMMA, reasoning: graded('low', 'low', 'medium') },
  compare: { modelId: GEMMA, reasoning: graded('low', 'low', 'medium') },
  examples: { modelId: GEMMA, reasoning: 'low' },
  pressemitteilung_examples: { modelId: GEMMA, reasoning: 'low' },
  bundestag: { modelId: GEMMA, reasoning: graded('low', 'low', 'medium') },
  abgeordnetenwatch: { modelId: GEMMA, reasoning: graded('low', 'low', 'medium') },
  news: { modelId: GEMMA, reasoning: graded('low', 'low', 'medium') },
  // Tier-3.5 loop demotion: the loop's model picks its own tools.
  agentic: { modelId: GEMMA, reasoning: 'low' },
  // Creative short-form — thinking does not help here.
  social_post: { modelId: GEMMA, reasoning: 'off' },
  image: { modelId: GEMMA, reasoning: 'off' },

  // ── Mistral Medium 3.5 ──
  //
  // The "narrate a platform ACTION" family. These announce something the
  // platform did (or is about to do) that the model cannot see in its context —
  // it has to know the product can do it at all. Measured on the live eval
  // (`evals/corpus/autolane.jsonl`, save_as_doc cases):
  //   - Small 4:  "Ich kann keine neuen Dateien … erstellen" — capability
  //               refusal, plus Siezen against the Du-Form house style, and the
  //               document was created anyway → narration contradicted action.
  //   - Gemma 4:  refuses too ("keinen Zugriff auf dein Dateisystem"), 4–5x
  //               slower, and one case failed to generate at all.
  //   - Medium:   "Ich habe … als Dokument im Grünerator gespeichert" — correct,
  //               Du-Form, narration matches the action.
  // Note the single-pass path has no `capabilityNote` (that lives in the
  // agentic loop), so these intents depend on the model's own product knowledge.
  save_as_doc: { modelId: MEDIUM, reasoning: 'off' },
  modify_doc: { modelId: MEDIUM, reasoning: 'off' },
  share_doc: { modelId: MEDIUM, reasoning: 'off' },
  artifact: { modelId: MEDIUM, reasoning: 'off' },

  edit_current_doc: { modelId: MEDIUM, reasoning: graded('medium', 'high', 'high') },
  edit_current_board: { modelId: MEDIUM, reasoning: graded('medium', 'high', 'high') },
  create_sheet: { modelId: MEDIUM, reasoning: graded('medium', 'high', 'high') },
  create_presentation: { modelId: MEDIUM, reasoning: graded('medium', 'high', 'high') },
  // Stillgelegt (09/2026) — total über `SearchIntent`; der Dauerauftrag läuft
  // als `agentic` mit Pin auf das Werkzeug `recurring_tasks`.
  create_recurring_task: { modelId: MEDIUM, reasoning: 'medium' },
  // Same family as its three siblings above: generate structured content AND
  // narrate a platform action the model cannot see in its context. It was the
  // only create_* intent missing from the table, so it took the speed lane —
  // exactly the setup the Mistral-lane note above documents as producing
  // capability refusals ("Ich kann keine neuen Dateien erstellen") while the
  // artefact is created anyway.
  create_pdf: { modelId: MEDIUM, reasoning: graded('medium', 'high', 'high') },
  // The router rewrites this to `agentic`; kept as a safety net.
  modify_board: { modelId: MEDIUM, reasoning: 'medium' },
  // The vision override in resolveModel wins over this anyway.
  image_edit: { modelId: MEDIUM, reasoning: 'off' },

  // ── Short/direct turns: Gemma 4 (31B, Regolo) — the former speed lane, folded in on 07.08.2026 (see the lane comment above) ──
  // Same grading as before: the substance is in the message, so the work is
  // formulating, not reasoning — but a complex rewrite still earns `low`.
  produktion: { modelId: GEMMA, reasoning: graded('off', 'off', 'low') },
  direct: { modelId: GEMMA, reasoning: graded('off', 'off', 'low') },
  // Ungraded, unlike `direct`: a greeting has no complexity axis to grade on —
  // the gate that produces it only fires when the message is a greeting and
  // nothing else. Spending reasoning tokens on "Hallo" is pure latency.
  greeting: { modelId: GEMMA, reasoning: 'off' },
};

/**
 * Unknown/absent intent → Gemma 4.
 *
 * This was the GPT-OSS speed lane until the 2026-07-31 wind-down. A catch-all
 * is exactly where GPT-OSS is most dangerous: an unlisted intent may well be
 * one that forces a tool call, and GPT-OSS answers those with prose. Gemma 4 on
 * Regolo costs no meaningful latency here (4.0s) and writes the better German.
 */
const DEFAULT_ENTRY: AutoEntry = { modelId: GEMMA, reasoning: graded('off', 'off', 'low') };

/**
 * Intents with no inherent task shape. Only these may be overridden by an
 * agent's `autoRoutingHint`; a `create_sheet` turn stays on the tool lane no
 * matter which agent is active.
 *
 * ABGELEITET: die `prose`-Disposition plus `agentic`. „Keine eigene
 * Aufgabenform" ist genau, was `prose` sagt (kein Werkzeug, Einzelpfad) —
 * `greeting` stand hier bisher mit der Begründung, es sei einmal Teil von
 * `direct` gewesen, und ist über die Ableitung ohne Sonderfall dabei. `agentic`
 * kommt hinzu, weil es der AUFFANGWERT ist: der Planer wählt die Werkzeuge
 * erst, also gibt das Verdikt selbst noch keine Form vor.
 *
 * Die Ableitung ist die Aussage: ein künftiger `prose`-Intent ist automatisch
 * überschreibbar, statt dass jemand daran denken muss.
 */
const HINT_OVERRIDABLE: ReadonlySet<ChatIntentId> = new Set<ChatIntentId>([
  ...intentsWithDisposition('prose'),
  'agentic',
]);

/**
 * Membership-Test, der ein unverengtes `string` annimmt.
 *
 * `intent` kommt hier laut `resolveAutoSelection` als Wire-String an — die
 * Datei nennt diesen Boundary bereits für den `POLICY`-Lookup. Der Cast steht
 * deshalb EINMAL neben der Menge statt an ihren drei Aufrufstellen; ein
 * Nicht-Mitglied liefert `false`, genau wie der Lookup auf DEFAULT_ENTRY fällt.
 */
function isHintOverridable(intent: string): boolean {
  return HINT_OVERRIDABLE.has(intent as ChatIntentId);
}

/**
 * Output-contract shapes (see `taskShape.ts`, which imports this union so the
 * detector and the policy cannot drift). Same override scope as the agent
 * hint, same reasoning: a `create_sheet` turn is already on its pinned lane no
 * matter what shape the text carries.
 */
export type TaskShape = 'code' | 'strict_format';

function gradeReasoning(rule: ReasoningRule, complexity: Complexity): ReasoningSetting {
  return typeof rule === 'string' ? rule : rule[complexity];
}

export interface AutoSelection {
  modelId: AutoLaneId;
  reasoning: ReasoningSetting;
}

export interface AutoSelectionInput {
  intent?: string | null | undefined;
  complexity?: Complexity | null | undefined;
  agentId?: string | null | undefined;
  /**
   * Surfaces that run no classifier and therefore have no intent. `notebook`
   * is RAG-grounded and pinned to the precise lane — the same choice the web
   * client makes locally in resolveAutoModel, kept here so a client that does
   * send `auto` doesn't silently land in the speed lane.
   */
  surface?: 'notebook' | null | undefined;
  /**
   * Output contract detected on the turn (`detectTaskShape`): machine-readable
   * output (`code`) or an explicitly checkable format order (`strict_format`).
   * Routes the neutral intents to the precise writer — which, second-order,
   * also flips the loop to unified mode (`prefersUnifiedLoop`), so these turns
   * never pass through the split synth that produced the QA run's broken JSON
   * and ignored line counts.
   */
  taskShape?: TaskShape | null | undefined;
  /**
   * Characters of MATERIAL the turn carries — this turn's upload plus every
   * document carried over from earlier turns (`turnMaterialChars`). Above
   * MATERIAL_LANE_MIN_CHARS the turn is work ON a text, not a question about
   * the world, and takes the precise lane with reasoning on.
   *
   * The signal `taskShape` cannot be: a format contract has to be *phrased*, so
   * detecting it means guessing at wordings, and a detector only ever knows the
   * formulations it was built against. A carried document has a length no
   * matter how its owner writes.
   */
  materialChars?: number | null | undefined;
}

/**
 * Above this much carried material the turn counts as document work.
 *
 * Same magnitude as INLINE_MATERIAL_MIN_CHARS in streamContext.ts, and for the
 * same reason: that is where a paste stops being a sentence and starts being a
 * document worth persisting. Not imported across the layer boundary — the
 * policy must stay testable without the request pipeline — but the two are
 * meant to move together.
 */
export const MATERIAL_LANE_MIN_CHARS = 3_000;

/**
 * Die Lane für Schritt 1 eines Pipeline-Agenten (Einfache/Leichte Sprache).
 *
 * GEMMA statt MEDIUM, und das ist die Korrektur eines gemessenen Ausfalls:
 * Am 13.08.2026 lief eine Übertragung von 5.838 Zeichen über die Material-Regel
 * unten auf Mistral Medium 3.5 mit `reasoning: medium`. Mistrals Dial ist binär,
 * also wurde daraus `reasoning_effort: 'high'`; das Modell dachte drei Minuten
 * lang — inhaltlich brauchbar, aber stark wiederholend —, schrieb kein einziges
 * Antwort-Token und starb an der Turn-Uhr. Der Nutzer verlor den ganzen Zug.
 *
 * Gemessen am selben Tag gegen api.regolo.ai, gleicher Prompt: gemma4-31b
 * denkt ~2.500 Zeichen und ist nach 13 s fertig (ohne Denken 3,5 s).
 *
 * `off` seit 14.08.2026, VERSUCHSWEISE — der Wert stand auf `medium`. Diese
 * Lane hat das Denken an dem Vormittag in KEINEM gemessenen Lauf zu Ende
 * gebracht: jeder endete mit „regolo/gemma4-31b hat 120000ms gedacht ohne zu
 * antworten — zweiter Versuch ohne Denken". Die ausgelieferte Fassung kam also
 * ohnehin jedes Mal vom Pfad ohne Denken; `medium` kaufte nichts und kostete
 * zwei Minuten pro Zug. `off` macht daraus die Voreinstellung, statt sie
 * zweimal anzulaufen.
 *
 * Zurückdrehen, sobald ein Lauf zeigt, dass das Denken hier durchkommt und die
 * Fassung besser macht — die Stufen selbst sind auf dieser Lane ohnehin Rauschen
 * (low/medium/high: 2533/2589/2412 Zeichen Reasoning, Messtabelle in
 * `services/ai/regoloReasoningStream.ts`), die Frage ist nur an/aus.
 *
 * Warum die Entscheidung HIER und nicht in der Pipeline-Registry steht: die
 * Registry sagt ausdrücklich, dass sie keine Modellwahl deklariert (zwei Orte,
 * die dasselbe entscheiden, driften). Lanes entscheidet diese Datei.
 */
const PIPELINE_LANE: AutoEntry = { modelId: GEMMA, reasoning: 'off' };

/**
 * Resolve `auto` to a concrete lane + reasoning strength.
 *
 * Order: surface pin → pipeline pin → table lookup by intent → complexity
 * grading → agent hint override → task-shape override → material override (the
 * last three on the neutral intents only). The material override runs last
 * because it is the only one that also raises reasoning.
 */
export function resolveAutoSelection(input: AutoSelectionInput): AutoSelection {
  const intent = input.intent ?? 'produktion';
  const complexity = input.complexity ?? 'simple';

  // Vor allen Overrides: ein Pipeline-Agent hat seine Aufgabe schon
  // festgelegt (`forceIntent: 'produktion'`, eigenes Material, eigene
  // Prüfkette). Hint, taskShape und Material-Regel hätten hier nichts mehr zu
  // entscheiden — sie würden nur die Lane wegdrehen, auf der die Kette misst.
  if (input.agentId && getPipelineAgent(input.agentId)) {
    return {
      modelId: PIPELINE_LANE.modelId,
      reasoning: gradeReasoning(PIPELINE_LANE.reasoning, complexity),
    };
  }

  if (input.surface === 'notebook') {
    return {
      modelId: MEDIUM,
      reasoning: gradeReasoning(graded('low', 'medium', 'high'), complexity),
    };
  }

  // `intent` arrives as a wire string, so the lookup is a genuine boundary: the
  // table is exhaustive over SearchIntent at COMPILE time, but nothing stops a
  // caller passing something else at runtime, and that must still resolve to
  // DEFAULT_ENTRY (the Gemma content lane) rather than throw. Never point that
  // default at GPT-OSS — an unlisted intent may force a tool call, which
  // GPT-OSS answers with prose (see the DEFAULT_ENTRY note).
  const entry = (POLICY as Partial<Record<string, AutoEntry>>)[intent] ?? DEFAULT_ENTRY;

  // `'creative'`/`'research'` hints are absent here on purpose: every
  // HINT_OVERRIDABLE intent already defaults to GEMMA after the 07.08.2026
  // lane fold, so those branches would be no-ops. Re-add a branch the day a
  // HINT_OVERRIDABLE intent's default stops being GEMMA.
  let modelId = entry.modelId;
  if (isHintOverridable(intent) && input.agentId) {
    const hint = getSystemAgent(input.agentId)?.autoRoutingHint;
    if (hint === 'precise') modelId = MEDIUM;
  }
  // AFTER the agent hint on purpose: an output contract is the user's own
  // format order, and format fidelity beats an agent's voice preference. Same
  // scope as the hint — a pinned tool intent stays on its lane regardless.
  if (input.taskShape != null && isHintOverridable(intent)) {
    modelId = MEDIUM;
  }

  let reasoning = gradeReasoning(entry.reasoning, complexity);

  // A turn that carries a document is work ON that text, and the work is
  // almost always comparison: translate it, check it, map it against itself.
  // Measured 13.08.2026 on exactly such a thread — four turns, all
  // `complexity=complex`, all graded `reasoning=low` because `agentic` carries
  // a flat 'low' that no complexity staffing touches. The model then rated
  // eight of eight paragraphs "vollständig", missed a modality shift ("kann
  // günstiger machen" → "ist günstiger") and contradicted its own table one
  // turn later. Reading two long texts against each other without thinking is
  // what that looks like.
  //
  // Lifts reasoning only, never lowers it: an intent that already asks for more
  // keeps what it asks for.
  if ((input.materialChars ?? 0) >= MATERIAL_LANE_MIN_CHARS && isHintOverridable(intent)) {
    modelId = MEDIUM;
    if (reasoning === 'off' || reasoning === 'low') reasoning = 'medium';
  }

  return { modelId, reasoning };
}

/**
 * ── Loop slot policy ────────────────────────────────────────────────────────
 * Declared here so planner, synth and the single-pass answer read as ONE
 * policy instead of two systems overriding each other. `providers.ts` turns
 * these into LanguageModel instances (it owns env + getModel).
 *
 * PLANNER: Mistral Small on GREENPT. The planner only calls tools and
 * formulates queries (the synth writes the prose), so Small's tool-calling is
 * plenty. Tool calls were verified live on all three tiers below on 13.08.2026:
 * `finish_reason=tool_calls`, valid argument JSON, empty `content`, no
 * reasoning leaking into the answer channel.
 *
 * WHY GREENPT AND NOT REGOLO, which this lane used until 13.08.2026: the
 * planner runs on EVERY agentic turn, and on Regolo it was the single reason
 * the personal footprint comparison came out WORSE than GPT-4o. Two independent
 * derivations put `mistral-small-4-119b` at 2,68-2,97 mWh per output token
 * (Regolo's own playground figure, and our GreenPT measurement of the 24B
 * scaled by parameter count); against Italy's 270 g/kWh that is 0,70 mg
 * CO2/token, where the GPT-4o reference sits at 0,40. GreenPT serves the 24B
 * from Scaleway Paris at 24 g/kWh, which is 0,014 mg/token — a factor of 48.
 *
 * Be honest about where that factor comes from: roughly 90% is the GRID, not
 * the model. The same move to Scaleway would pay off with a far heavier model.
 *
 * Second reason, independent of the first: GreenPT is the only lane that
 * reports its own energy per request (`greenptImpact.ts`), so the planner's
 * footprint stops being an extrapolation from someone else's hardware.
 *
 * History worth knowing before touching this: an earlier attempt at the regolo
 * planner was reverted for a "steps=0 gather" regression — the planner returned
 * without calling any tool. The `afterGather` guarantee in
 * agenticRespondService now backstops "did it actually call the generation
 * tool". A single tool-call probe does NOT prove multi-step gather holds, so if
 * it degrades, bump the model here (mistral-medium-3.5-128b on the same host)
 * rather than moving the provider back.
 *
 * Trade-off accepted: no Mistral prompt caching on this host either, so the
 * planner's fixed tool-usage prefix is re-billed every turn — same as before.
 *
 * The two lower tiers keep the loop alive when GreenPT is not configured:
 * regolo stays the self-hosted option, Mistral the last resort.
 */
export const LOOP_PLANNER_PRIMARY = {
  provider: 'greenpt' as const,
  model: 'mistral-small-3.2-24b-instruct-2506',
};
/**
 * Erste Ausweichstufe, wenn der Primär als zäh vermerkt ist.
 *
 * Cortecs, weil es die Lane ist, deren Gesundheit wir gerade am besten belegen
 * können: sie bedient bereits die SYNTH-Phase jedes Split-Zuges, ist in
 * `gemmaHosts.ts` als schnellster Endpunkt der Messreihe notiert (1122 ms bis
 * zum ersten Token) und lieferte im Vorfall vom 28.08.2026 die Antwort in 3 s,
 * während der Planer 45 s schwieg.
 *
 * Host und Modellname kommen aus `gemmaHosts.ts`, nicht als eigene Zeichen-
 * kette — dieselbe Regel wie bei LOOP_SYNTH_PRIMARY. Bewusst
 * `GEMMA_31B_ON_CORTECS` und nicht `GEMMA_31B_PRIMARY`: gemeint ist hier der
 * HOST Cortecs, nicht „wer gerade Gemma bedient". Zeigte der Wechselpunkt auf
 * Regolo, hätte diese Stufe sonst still den Anbieter gewechselt.
 *
 * ZWEI EHRLICHE EINSCHRÄNKUNGEN, beide bewusst in Kauf genommen:
 *
 * 1. Ob Gemma 4 so zuverlässig Werkzeuge ruft wie die Mistral-Gewichte der
 *    anderen Stufen, ist NICHT gemessen. Die Planer-Rolle lebt vom
 *    Werkzeugaufruf, und `isAgenticToolCapable` lässt bis heute nur Mistral zu
 *    (dort allerdings für die Nutzer-Auswahl im unified-Modus, nicht für diesen
 *    Slot). `afterGather` in agenticRespondService ist der Backstop, der ein
 *    „steps=0 gather" abfängt — genau die Regression, an der eine frühere
 *    Regolo-Vorgabe scheiterte. Wenn diese Stufe auffällig oft leer
 *    zurückkommt, ist das der erste Ort zum Nachsehen.
 * 2. Sie teilt Host UND Modell mit der Synth-Phase. Ein Cortecs-Ausfall nimmt
 *    dann beide Hälften des Zuges — der Grundsatz „der Ausweich ist ein anderer
 *    Vertragspartner" (siehe LOOP_SYNTH_*) gilt hier also nicht. Vertretbar,
 *    weil diese Stufe nur greift, wenn der Primär bereits nachweislich steht,
 *    und die dritte/vierte Stufe darunter andere Anbieter sind.
 */
export const LOOP_PLANNER_HEALTHY_ALT = {
  provider: GEMMA_31B_ON_CORTECS.provider,
  model: GEMMA_31B_ON_CORTECS.model,
};
export const LOOP_PLANNER_SELFHOSTED = {
  provider: 'regolo' as const,
  model: 'mistral-small-4-119b',
};
/**
 * Die letzte Stufe. Stand bis zum 29.08.2026 auf `litellm/verdigado-pro` und
 * war damit zweimal falsch: der Alias IST gpt-oss (am Proxy gemessen
 * 19.08.2026), also genau das Modell, das `AVOID_AS_SYNTH` ausschliesst — und
 * die Planer-Rolle lebt vom Werkzeugaufruf, den gpt-oss über diesen Adapter
 * nachweislich mit Prosa beantwortet (siehe die Artefakt-Notiz in
 * services/ai/lanes.ts).
 *
 * Mistral und NICHT Cortecs, obwohl Cortecs sonst überall an Verdigados Stelle
 * tritt: Cortecs ist bereits Stufe 2 (LOOP_PLANNER_HEALTHY_ALT). Eine letzte
 * Stufe, die denselben Vertragspartner nennt wie die zweite, ist keine Stufe.
 * `isAgenticToolCapable` lässt ohnehin nur Mistral zu.
 */
export const LOOP_PLANNER_FALLBACK = {
  provider: 'mistral' as const,
  model: 'mistral-medium-2604',
};

/** SYNTH: best German writer, and never a reasoning lane (latency).
 *
 *  Host und Modellname kommen aus `services/ai/gemmaHosts.ts` — dort steht die
 *  eine Entscheidung, wer Gemma 4 bedient, samt Messreihe. Hier stand bis zum
 *  25.08.2026 `regolo` fest verdrahtet, mit dem Zusatz „gemma-4 lives only on
 *  regolo"; das gilt seit dem Cortecs-Anschluss nicht mehr, und die doppelte
 *  Notiz war genau die Art Drift, die der zentrale Wechselpunkt beendet.
 *
 *  Der Ausweich ging bis 19.08.2026 auf `litellm/verdigado-pro` — „die
 *  always-up Lane". Am Proxy nachgemessen liegt hinter diesem Alias
 *  `gpt-oss:120b-ctx128k`, also genau das Modell, das AVOID_AS_SYNTH unten
 *  ausschliesst. Der Ausweich zeigte damit auf ein Verbots-Modell. Mistral
 *  Medium ist die verbleibende immer-erreichbare Lane, die die Policy für
 *  diesen Zweck zulässt — und bleibt es bewusst: der ANDERE Gemma-Host wäre
 *  qualitativ die nähere Wahl, teilt aber mit dem Primär die Modellfamilie.
 *  Wenn Gemma selbst das Problem ist, hilft nur eine andere Familie. */
export const LOOP_SYNTH_PRIMARY = {
  provider: GEMMA_31B_PRIMARY.provider,
  model: GEMMA_31B_PRIMARY.model,
};
export const LOOP_SYNTH_FALLBACK = { provider: 'mistral' as const, model: 'mistral-medium-2604' };

/** Models that must NEVER write the loop answer: reasoning/"think" lanes (slow),
 *  gpt-oss (verified tool-call fail / reasoning leak) und die chinesisch
 *  trainierten Lanes. Letztere sind heute nirgends mehr wählbar — der Zweig
 *  bleibt als zweite Sicherung neben `isExcludedTextModel`, weil
 *  REGOLO_DEFAULT_MODEL aus der Umgebung kommt und dort wieder eine stehen
 *  könnte. Any of these in the synth slot is rewritten to the
 *  best-writer lane. Stays active even when the policy chose the model.
 *
 *  DIE VERDIGADO-NAMEN BLEIBEN DRIN, obwohl der Host seit dem 29.08.2026 keine
 *  Lane mehr bedient (services/ai/litellmRetired.ts). Sie stehen in
 *  persistierten Thread-Zuständen und in gespeicherten Modell-Einstellungen;
 *  diese Liste prüft NAMEN, nicht Modelle, und ein alter Name, der hier
 *  durchfiele, wäre wieder ein Denkmodell im Synth-Slot. `gpt-oss` bleibt aus
 *  demselben Grund: Regolo serviert es weiterhin unter eigenem Namen. */
export const AVOID_AS_SYNTH = /verdigado-think|verdigado-pro|qwen|gpt-oss/i;

/**
 * Darf dieses Modell eine NUTZER-ANTWORT schreiben?
 *
 * Dieselbe Frage wie AVOID_AS_SYNTH, nur als Prädikat — damit die Stellen, die
 * ein Ausweichziel wählen, sie stellen können, ohne die Regex zu kennen. Sie
 * gilt für jede Lane, die am Ende Prosa an einen Menschen schickt: den
 * Synth-Slot des Split-Loops, die vereinheitlichte Loop-Lane und die
 * Einzeldurchlauf-Antwort. Der PLANER ist ausgenommen — der ruft Werkzeuge und
 * schreibt nichts, was jemand liest.
 */
export function mayWriteAnswer(target: { model: string }): boolean {
  return !AVOID_AS_SYNTH.test(target.model);
}
