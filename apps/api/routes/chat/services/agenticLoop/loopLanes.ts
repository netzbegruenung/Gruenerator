/**
 * Welche Modelle ein Loop-Zug fährt: die Leiter der Werkzeugphase (gewählte
 * Lane, dahinter die Ausweichstufen) und den werkzeuglosen Reparatur-Schreiber
 * samt Geschwister — plus die Haken, die eine kranke Stufe vermerken.
 */
import { type LanguageModel, type ModelMessage, type ToolSet } from 'ai';

import {
  MELIOUS_WIDE_MODEL,
  meliousGoesWide,
} from '../../../../services/ai/meliousThinkingFetch.js';
import { recordSlowVerdict } from '../../../../services/ai/modelHealth.js';
import { createLogger } from '../../../../utils/logger.js';
import {
  getRepairWriter,
  getRepairWriterFallback,
  resolveLoopLaneChain,
} from '../../agents/providers.js';
import { pruneMessages } from '../contextPruningService.js';
import { messagesForLane } from '../responseStreamingService.js';

import { type LaneUnhealthyReason } from './loopEngine.js';

const log = createLogger('AgenticRespond');

/** Je Werkzeug-Definition neben der Beschreibung: Name, Schema, JSON-Hülle
 *  (06.11.2026: 15 Werkzeuge ≈ 20,8k Zeichen im Request). */
const TOOL_DEFINITION_OVERHEAD_CHARS = 600;

/**
 * Wie gross der Request an das Modell ungefähr wird — in der Einheit, in der
 * `meliousWireModel` entscheidet (Zeichen des JSON-Bodys). Nur eine Schätzung:
 * an der Grenze kann sie danebenliegen.
 */
export function estimatedRequestChars(
  system: string,
  messages: readonly ModelMessage[],
  tools: ToolSet
): number {
  let chars = system.length + JSON.stringify(messages).length;
  for (const t of Object.values(tools)) {
    chars +=
      (typeof t.description === 'string' ? t.description.length : 0) +
      TOOL_DEFINITION_OVERHEAD_CHARS;
  }
  return chars;
}

export interface LoopLanes {
  model: LanguageModel;
  fallbackModels: LanguageModel[];
  repairModel: LanguageModel;
  repairFallback: LanguageModel | null;
  onLaneUnhealthy: (laneIndex: number, grund: LaneUnhealthyReason) => void;
  onRepairWriterUnhealthy: (grund: 'synth_stall' | 'synth_empty') => void;
  /** Der Verlauf für das Geschwister des Reparatur-Schreibers; null ohne Geschwister. */
  repairSiblingMessages: ((system: string) => ModelMessage[]) | null;
  /** Die Lane, die die Werkzeugphase wirklich startet (Zusammenfassungszeile). */
  laneName: string;
}

export function resolveLoopLanes(input: {
  resolution: {
    model: LanguageModel;
    modelName: string;
    provider: string;
    contextWindow?: number;
    fromAutoPolicy: boolean;
  };
  modelId: string | undefined;
  toolSystem: string;
  messages: ModelMessage[];
  tools: ToolSet;
}): LoopLanes {
  const { resolution, messages } = input;
  // `undecided` used to mean "the user sent auto" — but the auto policy now
  // resolves auto to a concrete lane BEFORE this runs, using the classifier's
  // intent. That IS a deliberate choice, so we let it reach the repair writer
  // instead of blanket-replacing it with the writer lane.
  const undecided = !resolution.fromAutoPolicy && (!input.modelId || input.modelId === 'mistral');

  // The tool-less writer chain re-writes an answer the loop got wrong (empty,
  // cut off, leaked plan, spam).
  const repair = getRepairWriter(
    { model: resolution.model, modelName: resolution.modelName, provider: resolution.provider },
    undecided
  );
  const repairFallback = getRepairWriterFallback(repair.name);
  // Was ein Melious-Body dieser Grösse auf dem Draht wird: ein grosser
  // `:balanced`-Request geht als `:speed` raus (`meliousWireModel`), und eine
  // `:speed`-Stufe dahinter wiederholte nur dieselbe Anfrage.
  const wireModelFor = (modelName: string): string | null =>
    meliousGoesWide(modelName, estimatedRequestChars(input.toolSystem, messages, input.tools))
      ? MELIOUS_WIDE_MODEL
      : null;
  // Unified Gemma: die ganze Kette, gewählte Stufe zuerst — ist sie als zäh
  // vermerkt, rückt sie ans Ende und der Zug startet auf `:speed`. Leer für
  // jede andere Lane; dann fährt die eine Instanz aus `resolution`.
  const chain = resolveLoopLaneChain(
    resolution.provider,
    resolution.modelName,
    wireModelFor(resolution.modelName),
    resolution.model
  );
  let laneName = resolution.modelName;
  if (chain[0] && chain[0].model !== resolution.modelName) {
    log.warn(
      `[Agentic] ${resolution.provider}/${resolution.modelName} gilt als zäh — unified startet auf ${chain[0].provider}/${chain[0].model}`
    );
    laneName = chain[0].model;
  }
  // Unknown: the history was budgeted against the lane floor, which may
  // exceed the fallback's window — rebuild rather than guess.
  const primaryWindow = resolution.contextWindow ?? Number.POSITIVE_INFINITY;

  return {
    model: chain[0]?.languageModel ?? resolution.model,
    fallbackModels: chain.slice(1).map((stage) => stage.languageModel),
    repairModel: repair.model,
    repairFallback: repairFallback?.model ?? null,
    // Eine Stufe der Werkzeugphase stand oder fiel aus. Umgeschaltet hat die
    // Leiter selbst; hier wird die Stufe vermerkt, damit der nächste Zug sie
    // überspringt. Der Index zeigt auf die Stufe, die WIRKLICH lief — derselbe
    // Modellname liegt auf zwei Hosts.
    onLaneUnhealthy: (laneIndex, grund) => {
      const stage = chain[laneIndex];
      if (!stage) return;
      recordSlowVerdict(stage.provider, stage.model, `unified:${grund}`);
      log.warn(
        `[Agentic] unified ${stage.provider}/${stage.model} ${
          grund === 'stall' ? 'lieferte nichts' : `fiel aus (${grund})`
        } — Lane wird übersprungen`
      );
    },
    // Der Reparatur-Schreiber stand oder blieb stumm, sein Geschwister
    // übernahm: Verdikte, die die Messung nicht liefert, weil nichts kam.
    onRepairWriterUnhealthy: (grund) => {
      recordSlowVerdict(repair.provider, repair.name, grund);
      log.warn(
        `[Agentic] repair writer ${repair.provider}/${repair.name} ${
          grund === 'synth_empty' ? 'returned no text' : 'stalled'
        } → falling back to ${repairFallback?.name ?? 'sibling'}`
      );
    },
    // The history was pruned for the selected lane — up to 262k on an
    // explicit Mistral turn. The repair writer's fallback is the Melious Gemma
    // lane, capped near 131k (#4201).
    repairSiblingMessages: repairFallback
      ? (system) =>
          messagesForLane(
            { modelName: repairFallback.name, contextWindow: repairFallback.contextWindow },
            primaryWindow,
            messages,
            (window) => pruneMessages(messages, window, system),
            '[Agentic]'
          )
      : null,
    laneName,
  };
}
