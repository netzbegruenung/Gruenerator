/**
 * Die zwei Zusicherungen, die ein Turn einlöst, wenn der Planer es nicht tut.
 *
 * Beide entstanden aus demselben beobachteten Verhalten: der geteilte Planer
 * behandelt einen Erstellungs- oder Bearbeitungsauftrag als reine Recherche und
 * hört nach dem Suchen auf. Was der Turn ZUGESAGT hat, kann davon nicht
 * abhängen — also führt der Turn das Werkzeug selbst aus.
 *
 * Beide sind idempotent (der `already`-Test bzw. `editorEditsSummary`), damit
 * `afterGather` in BEIDEN Modi laufen kann: split ruft es vor der Synthese,
 * unified nach dem Strom.
 */
import {
  BOARD_MODIFY_PATTERN,
  DOC_MODIFY_PATTERN,
} from '../../../../agents/langgraph/ChatGraph/nodes/classifierHeuristics.js';
import { artifactKind } from '../artifactKindRegistry.js';

import { withResearchedSources, type SourceRegistry } from './sourceRegistry.js';

import type { EditorSurfaceKind } from './routing.js';
import type { ChatGraphState } from '../../../../agents/langgraph/ChatGraph/types.js';
import type { SSEWriter } from '../sseHelpers.js';
import type { PersistedStep } from './types.js';
import type { ModelMessage, ToolSet } from 'ai';

/**
 * Nennt die Bitte selbst eine Bearbeitung? Dieselben Muster, die der
 * Klassifikator für seine `edit_current_*`-Schnellbahn benutzt — bewusst
 * geteilt statt kopiert, denn die Zusicherung springt genau dann ein, wenn die
 * Schnellbahn NICHT gefeuert hat (der Klassifikator kehrte früher zurück, oder
 * der Turn kam als `agentic`/`produktion` heraus). Zwei Muster, die
 * auseinanderdriften, hiessen: Werkzeug montiert, niemand ruft es, und der Turn
 * endet mit „keine passende Antwort" statt mit der Änderung.
 */
function askNamesAnEdit(surface: EditorSurfaceKind, ask: string): boolean {
  return surface === 'board' ? BOARD_MODIFY_PATTERN.test(ask) : DOC_MODIFY_PATTERN.test(ask);
}

/** A GFM table: header row followed by a delimiter row. Used to recognise that
 *  a "Tabelle"-turn was already answered inline in chat. */
const MARKDOWN_TABLE_RE = /^\s*\|.+\|\s*\r?\n\s*\|(?:\s*:?-+:?\s*\|)+\s*$/m;

export interface GuaranteeContext {
  state: ChatGraphState;
  messages: ModelMessage[];
  /** The UNWRAPPED catalog — the guarantees bypass the loop guards on purpose. */
  tools: ToolSet;
  sourceRegistry: SourceRegistry;
  sse: SSEWriter;
  recordStep: (step: PersistedStep) => void;
  /** A forced generation is "a tool actually runs" too — the held-back opening
   *  streams before its card, same as a planner-issued call. */
  emitOpeningBeforeTool: () => void;
  /** Read at CALL time: in unified mode the answer is already written when this
   *  runs, and that is exactly what the inline-table check asks about. */
  answerText: () => string;
  onInfo: (message: string) => void;
  onWarn: (message: string) => void;
}

/**
 * Builds the `afterGather` hook loopEngine calls between the tool phase and the
 * answer.
 */
export function createAfterGather(p: GuaranteeContext): () => Promise<void> {
  // The compound turn's whole point is the artifact — but the split planner
  // unreliably calls the generation fat tool (it treats the turn as pure
  // research and stops). GUARANTEE it: after gather, if the planner produced
  // no artifact, invoke the mounted generation tool directly with the
  // researched sources as the brief. The synth then announces it.
  const lastUserAsk = (): string => {
    const lastUser = [...p.messages].reverse().find((m) => m.role === 'user');
    return typeof lastUser?.content === 'string'
      ? lastUser.content
      : (lastUser?.content ?? [])
          .map((part) => (part.type === 'text' ? part.text : ''))
          .join(' ')
          .trim();
  };

  // Compound generation guarantee (spawns a NEW artefact). Idempotent via the
  // `already` check, so it is safe to call both inside afterGather (split,
  // BEFORE synth so the synth can confirm it) AND as a post-loop net for
  // unified mode, where afterGather never runs (loopEngine returns early).
  const forceCompoundGeneration = async (): Promise<void> => {
    const kind = p.state.compoundGenerationKind;
    if (!kind) return;
    const already =
      p.state.generatedImage != null ||
      (p.state.sharepicVariants?.length ?? 0) > 0 ||
      p.state.createdDocument != null ||
      p.state.createdBoard != null;
    if (already) return; // planner already created it
    // The model's own inline answer can BE the deliverable. In unified mode
    // this hook runs AFTER the stream, so when a "Tabelle"-turn was answered
    // with a markdown table in chat, spawning a spreadsheet on top duplicates
    // the answer — and the unwanted artifact then hijacks the NEXT turn via
    // the lastToolContext sheet-edit follow-up (QA 08/2026). Split mode is
    // unaffected: there the hook runs before synthesis, while `text` is
    // still empty.
    if (kind === 'sheet' && MARKDOWN_TABLE_RE.test(p.answerText())) {
      p.onInfo(
        '[Agentic] create_sheet not called — answer already carries an inline table, skipping forced generation'
      );
      return;
    }
    // Der Werkzeugname kommt aus der Registry, nicht aus einer eigenen Tabelle:
    // die hier war `Record<string, string>`, also ergab eine fehlende oder
    // vertippte Art `undefined` — und diese Zusicherung tat dann still nichts,
    // ausgerechnet auf dem Pfad, der einspringt, WEIL der Planer schon versagt
    // hat. `artifactKind` nimmt die Literal-Union, ein Nichtmitglied kompiliert
    // nicht mehr.
    const toolName = artifactKind(kind).loopToolName;
    const genTool = p.tools[toolName] as
      { execute?: (input: unknown, opts: { toolCallId: string }) => Promise<unknown> } | undefined;
    if (!genTool?.execute) return;
    // The brief stays the bare ask: the doc/PDF tools append the source block
    // themselves (withResearchedSources), so enriching it here would emit the
    // sources twice. `sharepic`/`board` have no registry of their own, so they
    // still get the enriched form.
    const userAsk = lastUserAsk();
    const selfSourcing = kind !== 'sharepic' && kind !== 'board';
    const brief = selfSourcing
      ? userAsk
      : withResearchedSources(userAsk, p.sourceRegistry.renderAll());
    // Both arg shapes: doc/board tools read `prompt`, sharepic reads `text`.
    const args = { prompt: brief, text: brief };
    const stepId = 'forced-generation';
    p.onInfo(`[Agentic] ${toolName} not called — forcing compound generation`);
    // Emit the same tool_step_start/result SSE + persisted step a planner-issued
    // call would, so a forced generation is a first-class tool step in the
    // trace, the UI tool-card, and the persisted history — NOT an invisible
    // out-of-band side effect. It bypasses the loop GUARDS on purpose: the
    // fallback is intentional and must fire even when the loop already spent its
    // failure/search budget (exactly the turns where the planner never reached
    // the generation tool). The `already` check above keeps it idempotent.
    // A forced generation is "a tool actually runs" too — the held-back
    // opening streams before its card, same as a planner-issued call.
    p.emitOpeningBeforeTool();
    p.sse.send('tool_step_start', { stepId, toolName, args });
    let result: unknown;
    try {
      result = await genTool.execute(args, { toolCallId: stepId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      p.onWarn(`[Agentic] forced ${toolName} failed: ${message}`);
      result = { error: message };
    }
    const resultRecord =
      result && typeof result === 'object' && !Array.isArray(result)
        ? (result as Record<string, unknown>)
        : { value: result };
    const ok = resultRecord.error == null;
    p.sse.send('tool_step_result', { stepId, toolName, ok, result: resultRecord });
    p.recordStep({ toolCallId: stepId, toolName, args, result: resultRecord });
  };

  const afterGather = async (): Promise<void> => {
    // (a) Editor-surface edit guarantee: an edit_current_* turn MUST edit the
    //     open artefact. The split planner unreliably calls edit_document
    //     (observed live: steps=0 on most sheet/deck edits) — force it here,
    //     BEFORE synth, so editorEditsSummary is set and the synth confirms the
    //     change instead of writing empty text (→ fallback) or a false refusal.
    //     Der Intent ist NICHT das Kriterium, sondern nur eines von dreien: das
    //     Werkzeug hängt an der FLÄCHE, nicht am Intent, und der Klassifikator
    //     verfehlt seine `edit_current_*`-Schnellbahn regelmässig (live am
    //     19.08.2026: „Erstelle eine Aufgabe …" auf einem offenen Board kam als
    //     `agentic` heraus, der Planer rief nichts, steps=0 — und der*die
    //     Nutzer*in bekam „keine passende Antwort" auf eine glasklare Bitte).
    //     Also fragt die Zusicherung zusätzlich den TEXT, mit genau den Mustern
    //     der Schnellbahn: eine reine Frage ans Board („wie viele Aufgaben sind
    //     offen?") trifft keines davon und löst weiterhin keine Änderung aus.
    const editSurface = p.state.editToolSurface;
    const userAsk = lastUserAsk();
    if (
      editSurface &&
      (p.state.intent === 'edit_current_doc' ||
        p.state.intent === 'edit_current_board' ||
        p.state.compoundEdit === true ||
        askNamesAnEdit(editSurface, userAsk)) &&
      !p.state.editorEditsSummary
    ) {
      const editTool = p.tools['edit_document'] as
        | { execute?: (input: unknown, opts: { toolCallId: string }) => Promise<unknown> }
        | undefined;
      if (editTool?.execute && userAsk) {
        const sourcesBlock = p.sourceRegistry.renderReference();
        const instruction = sourcesBlock
          ? `${userAsk}\n\nRecherchierte Quellen dazu:\n${sourcesBlock}`
          : userAsk;
        p.onInfo('[Agentic] planner skipped edit_document — forcing edit before synth');
        try {
          await editTool.execute({ instruction }, { toolCallId: 'forced-edit' });
        } catch (err) {
          p.onWarn(
            `[Agentic] forced edit_document failed: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }

    // (b) Compound generation guarantee (spawns a NEW artefact).
    await forceCompoundGeneration();
  };

  return afterGather;
}
