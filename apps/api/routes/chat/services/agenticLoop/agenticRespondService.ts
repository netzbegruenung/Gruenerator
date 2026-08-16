/**
 * Agentic respond path (Phase 1, flag CHAT_AGENT_LOOP).
 *
 * Replaces the single-pass "classifier picks one search, responder writes prose
 * over it" flow for the search family with a real tool loop: the model holds the
 * internal search tools and calls them — sees the results — refines or calls
 * another — until it can answer, then writes the answer in the SAME streamed
 * turn. One model drives tools AND writes the reply (no second summariser LLM).
 *
 * Built on the AI SDK `streamText` substrate proven by the sharepic edit loop.
 * Cross-cutting concerns (guards, real tool cards, timeouts, truncation, step
 * recording) come from `wrapToolsForLoop`; force-finish and lenient arg repair
 * are configured here.
 */
import { type ModelMessage } from 'ai';

import { knownArtifactRefs } from '../../../../agents/langgraph/ChatGraph/nodes/artifactInventory.js';
import { forbidsNewResearch } from '../../../../agents/langgraph/ChatGraph/nodes/fastPathGuards.js';
import { recordSlowVerdict } from '../../../../services/ai/modelHealth.js';
import { createLogger } from '../../../../utils/logger.js';
import { type McpCatalog } from '../../agents/mcpCatalog.js';
import {
  getLoopPlannerModel,
  getLoopSynthFallbackModel,
  getLoopSynthModel,
  loopPlannerModelName,
} from '../../agents/providers.js';
import { renderRecipeCatalog } from '../../agents/recipeCatalog.js';
import { imageDeliveryNote } from '../../agents/searchImageHarvest.js';
import { extractTextContent } from '../messageHelpers.js';
import {
  mistralReasoningOption,
  resolveModel,
  type ResolvedModelTuple,
} from '../responseStreamingService.js';
import { type SSEWriter } from '../sseHelpers.js';
import { type ThreadToolHistory } from '../threadPersistenceService.js';
import { resolveAbortOutcome } from '../turnAbortOutcome.js';
import { turnMaterialChars } from '../turnMaterial.js';
import { withInstructionHierarchy } from '../untrustedContent.js';

import {
  assembleToolCatalog,
  buildToolReplay,
  createLoopGuards,
  rehydrateCarriedSources,
  wrapAssembledTools,
} from './catalogAssembly.js';
import { isMcpCapabilityQuestion, shouldForceFirstToolCall } from './forceFirstToolCall.js';
import { createTurnClocks, resolveBudget } from './loopBudget.js';
import { runAgenticLoop, type LoopMode } from './loopEngine.js';
import { createAfterGather } from './loopGuarantees.js';
import { MAX_SOURCES } from './loopGuards.js';
import { materialDominatesTurn, resolveLoopMode } from './loopMode.js';
import { createAnswerEmitter } from './loopSse.js';
import { spliceToolReplay } from './mcpReplay.js';
import { stripDuplicatedOpening } from './openingDedupe.js';
import { rewritesSuppliedText } from './routing.js';
import { createSourceRegistry } from './sourceRegistry.js';
import { buildConnectorNotes, buildSynthSystem, type SynthPromptContext } from './synthPrompt.js';
import { createAnswerValidator, finalizeAnswerText, pdfProblemNote } from './synthVerdicts.js';
import { buildToolUsageBlock } from './toolUsageBlock.js';
import { logTurnSummary } from './turnSummary.js';
import { type PersistedStep } from './types.js';

import type {
  ChatGraphState,
  Citation,
  SearchResult,
} from '../../../../agents/langgraph/ChatGraph/types.js';
import type { Request } from 'express';

const log = createLogger('AgenticRespond');

export { isAgenticLoopEnabled } from './flags.js';

/**
 * Abbruch-Ausgang und Trunkierungs-Notiz liegen seit 13.08.2026 in
 * `../turnAbortOutcome.js`, weil der Single-Pass-Pfad dieselbe Antwort braucht
 * — dort fiel die Turn-Uhr bis dahin stumm aus und der Stummel wurde als
 * fertige Antwort gespeichert. Re-Export, damit Aufrufer und Tests unverändert
 * über diesen Namen importieren.
 */
export { TRUNCATION_NOTE, resolveAbortOutcome, type AbortOutcome } from '../turnAbortOutcome.js';

/**
 * The three collaborators the orchestration itself is ABOUT: which model runs,
 * what is mounted, and how the loop is driven. Injected so the decisions in
 * between — mode choice, verdict retry, budget, catalog degradation — can be
 * tested without a model, a database or a connector (same pattern as
 * `loopEngine`'s `LoopDeps`).
 */
export interface AgenticRespondDeps {
  resolveModel: typeof resolveModel;
  assembleToolCatalog: typeof assembleToolCatalog;
  runAgenticLoop: typeof runAgenticLoop;
}

const defaultDeps: AgenticRespondDeps = { resolveModel, assembleToolCatalog, runAgenticLoop };

export interface AgenticResponseOutcome {
  fullText: string;
  steps: PersistedStep[];
  citations: Citation[];
  sources: SearchResult[];
  modelName: string;
}

/**
 * Run one agentic respond turn. Always resolves to an outcome (never throws to
 * the caller): a hard failure with no streamed text degrades to a short German
 * apology so the turn still persists and closes cleanly.
 */
export async function streamAgenticResponse(
  params: {
    finalState: ChatGraphState;
    systemMessage: string;
    messages: ModelMessage[];
    modelId?: string;
    requestId: string;
    sse: SSEWriter;
    reqSignal?: AbortSignal;
    /** Express request — required by the sharepic fat tool (compound turns). */
    req?: Request;
    threadId?: string | null;
    /** The thread's tool memory, already read by `buildStreamContext` for the
     *  classifier's artifact list. Both reads below project the SAME rows, so
     *  taking them from here turns three round trips per loop turn into one.
     *  Null (absent, or the shared read failed) falls back to reading here, which
     *  keeps each failure as narrow as it was before. */
    toolHistory?: ThreadToolHistory | null;
  },
  deps: AgenticRespondDeps = defaultDeps
): Promise<AgenticResponseOutcome> {
  const {
    finalState,
    systemMessage,
    messages,
    modelId,
    requestId,
    sse,
    reqSignal,
    req,
    threadId,
    toolHistory,
  } = params;
  const budget = resolveBudget();
  const agentConfig = finalState.agentConfig;

  const sourceRegistry = createSourceRegistry();
  const guards = createLoopGuards(sourceRegistry);
  const steps: PersistedStep[] = [];
  const emitter = createAnswerEmitter(sse);
  let resolution: Awaited<ReturnType<typeof resolveModel>> | null = null;
  let mcpCatalog: McpCatalog | null = null;
  let systemCatalog: McpCatalog | null = null;
  let toolReplayMessages: ModelMessage[] = [];
  let mode: LoopMode = 'unified';
  let synthName = '';
  // Time the (un-budgeted) MCP tool-mount so a slow connector shows up in the
  // end-of-turn line instead of looking like an unexplained multi-second hang.
  let mcpMountMs = 0;

  // Computed BEFORE the model is resolved: the same number decides the lane
  // (precise + reasoning on) and, further down, whether the writer gives up the
  // tool catalog. Two computations could disagree — see turnMaterial.ts.
  const carriedMaterialChars = turnMaterialChars(finalState);

  try {
    resolution = await deps.resolveModel(
      {
        provider: agentConfig.provider as string,
        model: agentConfig.model,
        ...(agentConfig.defaultModel != null && { defaultModel: agentConfig.defaultModel }),
      },
      modelId,
      requestId,
      {
        intent: finalState.intent,
        agentId: agentConfig.identifier,
        ...(finalState.complexity != null && { complexity: finalState.complexity }),
        ...(finalState.taskShape != null && { taskShape: finalState.taskShape }),
        materialChars: carriedMaterialChars,
      }
    );

    const assembled = await deps.assembleToolCatalog({
      state: finalState,
      sourceRegistry,
      sse,
      ...(req && { req }),
      threadId: threadId ?? null,
    });
    const { tools, recipeCatalog, recipeRegistry, toolLabels } = assembled;
    mcpCatalog = assembled.mcpCatalog;
    systemCatalog = assembled.systemCatalog;
    mcpMountMs = assembled.mcpMountMs;
    const managedKeys = finalState.managedSourceKeys ?? [];

    if (threadId) {
      toolReplayMessages = await buildToolReplay({
        threadId,
        tools,
        toolHistory: toolHistory ?? null,
        onError: (m) => log.warn(m),
      });
    }

    // Ein Kürzungsauftrag ist in dem Text gegründet, an dem er arbeitet — nur
    // deshalb fragt der Loop hier überhaupt erst (siehe rehydrateCarriedSources).
    const askForCarry =
      finalState.lastUserTextNoMentions ??
      extractTextContent(messages[messages.length - 1]?.content ?? '');
    if (threadId && !rewritesSuppliedText(askForCarry)) {
      await rehydrateCarriedSources({
        threadId,
        sourceRegistry,
        toolHistory: toolHistory ?? null,
        onInfo: (m) => log.info(m),
        onError: (m) => log.warn(m),
      });
    }

    const wrapped = wrapAssembledTools(tools, {
      sse,
      guards,
      recordStep: (step) => steps.push(step),
      perCallTimeoutMs: budget.perCallTimeoutMs,
      toolLabels,
      // Reads `mode` lazily: it's finalized further down, before the loop runs.
      getTextOffset: () => (mode === 'unified' ? emitter.text.length : null),
      takeNarration: () => emitter.takeNarration(),
    });

    // WS-5: "was kann @sally" must be grounded in the server's REAL tools, not
    // the model's imagination — and it also gates WS-4 forcing off (a capability
    // answer is a description, not a tool call), which is why the orchestrator
    // reads it once and hands it to both.
    const lastUserText = extractTextContent(messages[messages.length - 1]?.content ?? '');
    const mcpCapabilityQuestion = isMcpCapabilityQuestion(lastUserText);
    const { mcpNote, systemNote, connectorCatalogNote } = buildConnectorNotes({
      state: finalState,
      mcpCatalog,
      systemCatalog,
      managedKeys,
      mcpCapabilityQuestion,
    });

    const materialHeavy = materialDominatesTurn(lastUserText, systemMessage, carriedMaterialChars);
    mode = resolveLoopMode(resolution.provider, resolution.modelName, materialHeavy);
    if (materialHeavy) {
      log.info(
        `[Agentic] material-heavy turn (${lastUserText.length}c user + ${carriedMaterialChars}c documents vs ${systemMessage.length}c system) — writing without the tool catalog`
      );
    }

    // Unified mode has no synth phase, so it never sees `renderAll()` — the
    // carried sources would be numbered, chip-backed and completely invisible to
    // the model that writes the answer. Split mode gets them via buildSynthSystem
    // instead, so injecting here too would ship the same block twice.
    const carriedNote =
      mode === 'unified' && sourceRegistry.carriedSize > 0
        ? `\n\nQUELLEN AUS FRÜHEREN TURNS DIESES GESPRÄCHS (nummeriert — belege sie mit [N] wie eigene Treffer, behaupte aber NICHT, gerade recherchiert zu haben; sag stattdessen, dass sich die Angaben auf die Recherche von vorhin stützen). Ergebnisse neuer Suchen in diesem Turn zählen ab [${sourceRegistry.carriedSize + 1}] weiter:\n${sourceRegistry.renderAll()}`
        : '';
    // Same predicate the catalog used to decide what to mount — read once here
    // so prompt and toolset can never disagree about whether searching is on.
    const researchBanned = forbidsNewResearch(finalState.lastUserTextNoMentions ?? lastUserText);
    const toolSystem = withInstructionHierarchy(
      `${systemMessage}\n\n${buildToolUsageBlock(budget.maxSteps, researchBanned, mode === 'unified', Object.keys(wrapped))}${mcpNote}${systemNote}${connectorCatalogNote}${carriedNote}${renderRecipeCatalog(recipeCatalog)}`
    );
    const { abortSignal, writeAbortSignal, toolBudgetDeadline } = createTurnClocks(
      budget,
      reqSignal
    );

    // Der Zustand, den die frühere Closure einfach SAH, steht jetzt als
    // ausdrücklicher Kontext da. Lebende Referenzen: `steps` füllt sich noch,
    // während dieser Kontext schon existiert, und der Prompt wird erst danach
    // gebaut.
    const synthContext: SynthPromptContext = {
      state: finalState,
      systemMessage,
      mcpNote,
      steps,
      tools,
      sourceRegistry,
      recipeRegistry,
      opening: () => (emitter.openingEmitted ? emitter.openingSentence : null),
    };

    // Split slots pick the best model per phase (fast tool-caller plans, best
    // writer synthesizes). Unified (Mistral) uses one model for both.
    //
    // `undecided` used to mean "the user sent auto" — but the auto policy now
    // resolves auto to a concrete lane BEFORE this runs, using the classifier's
    // intent. That IS a deliberate choice, so we let it reach the synth slot
    // instead of blanket-replacing it with the writer lane. AVOID_AS_SYNTH
    // still guards the slow think-lanes either way, so a policy pointing at
    // gemma-litellm (→ verdigado-think) is still rewritten to gemma4-31b.
    const undecided = !resolution.fromAutoPolicy && (!modelId || modelId === 'mistral');
    const synth =
      mode === 'split'
        ? getLoopSynthModel(
            {
              model: resolution.model,
              modelName: resolution.modelName,
              provider: resolution.provider,
            },
            undecided
          )
        : { model: resolution.model, name: resolution.modelName, provider: resolution.provider };
    synthName = synth.name;

    const afterGather = createAfterGather({
      state: finalState,
      messages,
      tools,
      sourceRegistry,
      sse,
      recordStep: (step) => steps.push(step),
      emitOpeningBeforeTool: () => emitter.emitOpeningBeforeTool(),
      answerText: () => emitter.text,
      onInfo: (m) => log.info(m),
      onWarn: (m) => log.warn(m),
    });

    // Die fünf Wege dahinter stehen in `shouldForceFirstToolCall` — samt der
    // Live-Ausfälle, die jeden einzelnen erzwungen haben.
    const forceFirstToolCall = shouldForceFirstToolCall({
      researchBanned,
      intent: finalState.intent,
      hasMcpScope: finalState.mcpServerScope != null,
      isMcpCapabilityQuestion: mcpCapabilityQuestion,
      mcpToolCount: mcpCatalog?.labels.size ?? 0,
      lastUserText,
      loopDemotedFromRetrieval: finalState.loopDemotedFromRetrieval === true,
      classifierContradictedResearch: finalState.classifierContradictedResearch === true,
      materialHeavy,
    });

    // The synth phase emits nothing between the last tool result and the first
    // answer token. Until this guard existed a lane that stalled there took the
    // whole turn down: no text, no error, no heartbeat, for the full 120s wall
    // clock — users read that as "it just aborts".
    const synthFallback = mode === 'split' ? getLoopSynthFallbackModel(synth.name) : null;

    const loopResult = await deps.runAgenticLoop({
      mode,
      plannerModel: mode === 'split' ? getLoopPlannerModel() : resolution.model,
      synthModel: synth.model,
      ...(synthFallback && { synthFallbackModel: synthFallback.model }),
      onSynthStart: () => {
        emitter.startSynthHeartbeat();
      },
      onSynthFallback: () => {
        // Stillstand ist das Verdikt, das die Messung nicht liefert: es kam
        // nichts, was sich hätte messen lassen.
        recordSlowVerdict(synth.provider, synth.name, 'synth_stall');
        if (!synthFallback) return;
        log.warn(`[Agentic] synth ${synth.name} stalled → falling back to ${synthFallback.name}`);
        sse.send('fallback', {
          from: { id: synth.name, name: synth.name },
          to: { id: synthFallback.name, name: synthFallback.name },
          reason: 'first_token_timeout',
        });
      },
      tools: wrapped,
      toolSystem,
      forceFirstToolCall,
      // Turns "the web is now allowed" into "the web runs". Only when the tool
      // is actually mounted — a restricted agent without web_search must not be
      // forced into a tool it doesn't have.
      forcedToolForStep: () => {
        const toolName = guards.emptyResultFallback();
        if (!toolName || !(toolName in wrapped)) return null;
        log.info(
          `[Agentic] internal search returned nothing — forcing ${toolName} instead of leaving it to the planner`
        );
        return toolName;
      },
      buildSynthSystem: (sources) => buildSynthSystem(sources, synthContext),
      // The image note rides on the source block because that is the ONLY thing
      // the synth phase sees of the gathering — it gets no tool results, so the
      // note the planner received in its tool result would never reach the model
      // that actually writes the answer. Appended, never registered: an image has
      // no text, so it must not become a numbered `[N]`.
      getSourcesBlock: () => {
        const sources = sourceRegistry.renderAll();
        const note = imageDeliveryNote(finalState.webImageResults?.length ?? 0);
        return note ? `${sources}\n\n${note}` : sources;
      },
      // Unified mode only — read per step because `rezept_laden` fills the
      // registry mid-loop. Split mode's writer gets it via buildSynthSystem.
      getRecipeBlock: () => recipeRegistry.render(),
      // Prepend the reconstructed tool-call/result history just before the
      // current user message so tool_call↔result pairs stay adjacent + valid.
      // The splice also bridges tool→user, which mistral-common rejects.
      messages: spliceToolReplay(messages, toolReplayMessages),
      // The synth phase runs WITHOUT tools — it gets the plain history. Feeding
      // it the replay made it imitate the tool-call pattern in prose instead of
      // answering (live: the entire answer was "Let's perform web_search.").
      synthMessages: messages,
      maxSteps: budget.maxSteps,
      temperature: agentConfig.params.temperature ?? 0.3,
      // No output cap (OpenWebUI-style): the model window is the backstop.
      // The old 4000-token floor truncated think-lane answers mid-sentence.
      //
      // The auto policy grades a reasoning strength for every turn, and until
      // now the loop resolved it and then dropped it: `resolveModel` used it to
      // pin a thinking turn to the Mistral API (`needsReasoning`), but no phase
      // ever sent the option that actually switches thinking on. The lane moved,
      // the reasoning did not.
      ...(mistralReasoningOption(resolution.reasoningEffort) != null && {
        providerOptions: {
          mistral: {
            reasoningEffort: mistralReasoningOption(resolution.reasoningEffort) as string,
          },
        },
      }),
      abortSignal,
      writeAbortSignal,
      afterGather,
      forceFinish: () =>
        // The turn budget lands HERE rather than on the abort signal: spending
        // it must end the tool work, not the sentence being written. In unified
        // mode this is also what protects the answer — one stream holds tools
        // and text there, so a hard timeout could only ever cut prose.
        Date.now() >= toolBudgetDeadline ||
        finalState.generatedImage != null ||
        (finalState.sharepicVariants?.length ?? 0) > 0 ||
        finalState.createdDocument != null ||
        finalState.createdBoard != null,
      // Every answer delta runs through the opening dedupe: the synth is told
      // not to restate the already-streamed opening sentence, but the small
      // lanes do it anyway ("Hallo zusammen, Hallo zusammen …"). The dedupe
      // holds the head of the answer only while a duplicate is still possible,
      // then streams normally; in unified mode (no narrated opening) it is a
      // pure passthrough from the first delta.
      onText: (delta) => emitter.pushAnswer(delta),
      onReasoning: (delta) => sse.send('reasoning_delta', { text: delta }),
      // Split-gather narration: the planner's inter-tool prose, sentence-wise.
      // The FIRST sentence — the model's opening plan — crosses into the real
      // answer text, but only once a tool actually starts (see
      // emitOpeningBeforeTool): a plan line on a turn that then calls no tool
      // announces nothing and only duplicates the synth's own opening. Every
      // later sentence stays on the existing side channel: buffered for the
      // next tool_step_start to stamp onto its card, and sent live on its own
      // SSE event. Repeating the opening line per tool call would be noise the
      // tool card already carries.
      onNarration: (s) => emitter.handleNarration(s),
      validateAnswer: createAnswerValidator(),
    });
    emitter.flush();

    if (loopResult.replacedStreamed) {
      // The validation retry replaced an answer that was already on the wire.
      // Same replacement channel the citation clamp uses: `completion` swaps
      // the streamed deltas for the corrected text, and the recorded offsets
      // (which index into the discarded stream) are dropped.
      const shownOpening = emitter.openingEmitted ? emitter.openingSentence : null;
      const prefix = shownOpening ? `${shownOpening} ` : '';
      emitter.setText(prefix + stripDuplicatedOpening(loopResult.text, shownOpening));
      for (const s of steps) delete s.textOffset;
      sse.send('completion', { text: emitter.text, citations: sourceRegistry.getCitations() });
    }

    // Edit + compound-generation guarantees now run inside afterGather in BOTH
    // loop modes (loopEngine calls it post-stream for unified), so no separate
    // post-loop net is needed here. The hooks are idempotent via
    // editorEditsSummary / the `already` artifact check.

    if (emitter.text.trim().length === 0) {
      // An edit that succeeded but left the model silent must NOT surface the
      // generic "no answer" error (observed live: 5 slides created, chat said
      // "keine Antwort gefunden"). Confirm the edit instead.
      // Replacement text invalidates offsets recorded against the streamed
      // (whitespace-only) text — drop them so reload keeps cards-first.
      for (const s of steps) delete s.textOffset;
      emitter.replaceAndStream(
        finalState.editorEditsSummary
          ? `Erledigt — ${finalState.editorEditsSummary}.`
          : 'Ich konnte dazu leider keine passende Antwort finden. Magst du deine Frage anders formulieren?'
      );
    }
  } catch (err) {
    // Anything the dedupe still holds is real answer text — release it before
    // the outcome logic reads `text`.
    emitter.flush();
    const msg = err instanceof Error ? err.message : String(err);
    const aborted =
      err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError');
    log.warn(`[Agentic] loop ${aborted ? 'stopped (budget/abort)' : 'failed'}: ${msg}`);
    const outcome = resolveAbortOutcome({ text: emitter.text, aborted });
    if (outcome?.mode === 'replace') {
      for (const s of steps) delete s.textOffset;
      emitter.replaceAndStream(outcome.delta);
    } else if (outcome?.mode === 'append') {
      // The half answer stays — it is real work and dropping it helps nobody —
      // but it must not PASS as a finished one. APPEND, never replace: recorded
      // textOffsets index into the prefix and stay valid this way.
      emitter.appendAndStream(outcome.delta);
    }
  } finally {
    emitter.endSynthHeartbeat();
    if (mcpCatalog) await mcpCatalog.close();
    if (systemCatalog) await systemCatalog.close();
    if (resolution?.releaseSlot) await resolution.releaseSlot();
  }

  // Accessibility findings the answer swallowed. Appended, never substituted:
  // the answer stays whatever the model wrote, it just cannot leave the defect
  // out. Runs before the citation clamp so the note is part of the text the
  // `completion` event may replace.
  const pdfNote = pdfProblemNote(steps, emitter.text);
  if (pdfNote) {
    log.info('[Agentic] PDF self-check problems not mentioned by the answer — appending them');
    emitter.appendAndStream(pdfNote);
  }

  const finalized = finalizeAnswerText({
    text: emitter.text,
    sourceCount: sourceRegistry.size,
    stepCount: steps.length,
    seenTexts: [
      // A name the user typed themselves is not one the model invented.
      finalState.lastUserTextNoMentions ?? '',
      sourceRegistry.renderAll(),
      finalState.attachmentContext ?? '',
      finalState.currentDocument?.title ?? '',
    ],
    knownArtifactRefs: knownArtifactRefs(finalState),
  });
  for (const warning of finalized.warnings) log.warn(warning);
  // Assigned unconditionally: a stripped artefact delivery changes the answer
  // WITHOUT earning a `completion` — the removal is silent, the text still has
  // to be the one that gets persisted.
  emitter.setText(finalized.text);
  if (finalized.replaced) {
    // Offset-drift protection: the clamp rewrote the answer text, so every
    // recorded textOffset now points into a stale position. Drop them — reload
    // then falls back to the cards-first layout instead of mis-interleaving.
    for (const s of steps) delete s.textOffset;
    sse.send('completion', { text: emitter.text, citations: sourceRegistry.getCitations() });
  }

  logTurnSummary({
    modelName: resolution?.modelName ?? agentConfig.model,
    mode,
    plannerName: mode === 'split' ? loopPlannerModelName() : null,
    synthName,
    intent: finalState.intent,
    steps,
    sourceCount: sourceRegistry.size,
    carriedCount: sourceRegistry.carriedSize,
    answerChars: emitter.text.length,
    mcpMountMs,
    onInfo: (m) => log.info(m),
  });

  return {
    fullText: emitter.text,
    steps,
    citations: sourceRegistry.getCitations(),
    // MAX_SOURCES, not 10: this is what gets persisted and what a later turn
    // rehydrates. Capping here below the loop's own gathering budget silently
    // threw away half the research of a thorough turn.
    sources: sourceRegistry.getResults(MAX_SOURCES),
    modelName: resolution?.modelName ?? agentConfig.model,
  };
}

// Re-exported so the router can type the resolution without a second import path.
export type { ResolvedModelTuple };
