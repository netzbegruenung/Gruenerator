/**
 * Client-tool interrupt: run-then-answer spreadsheet compute.
 *
 * Tabular aggregation question + a client that can execute Python (web injects
 * a Pyodide runner and declares clientTools:['run_python']): generate pandas
 * code server-side, pause the turn, let the browser run it and resume with the
 * verified numbers. Clients without the capability (mobile, voice) fall
 * through to the legacy prompt-guidance path.
 */

import { pandasComputeNode } from '../../../agents/langgraph/ChatGraph/index.js';
import {
  isSheetFillRequest,
  isTabularComputeQuestion,
} from '../../../agents/langgraph/ChatGraph/nodes/classifierHeuristics.js';
import { createLogger } from '../../../utils/logger.js';
import { getIntentMessage, sendChatWarning, type SSEWriter } from '../services/sseHelpers.js';

import { suspendTurn, type SuspendTurnBase } from './turnEnd.js';
import { type MaybeHandled, type StreamBody } from './types.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';

const log = createLogger('chatGraphContractRouter');

export interface ComputeInterruptStageParams {
  sse: SSEWriter;
  classifiedState: ChatGraphState;
  suspendBase: SuspendTurnBase;
  forcedTool: boolean;
  /** Merged @-mention tools — any explicit pick keeps its own flow. */
  forcedTools: string[] | undefined;
  lastUserText: string;
  clientTools: StreamBody['clientTools'];
  actualThreadId: string | undefined;
}

export async function runComputeInterruptStage({
  sse,
  classifiedState,
  suspendBase,
  forcedTool,
  forcedTools,
  lastUserText,
  clientTools,
  actualThreadId,
}: ComputeInterruptStageParams): Promise<MaybeHandled> {
  // === Client-tool interrupt: run-then-answer spreadsheet compute ===
  // Tabular aggregation question + a client that can execute Python
  // (web injects a Pyodide runner and declares clientTools:['run_python']):
  // generate pandas code server-side, pause the turn, let the browser run
  // the code and resume with the verified numbers. Mirrors the ask_human
  // interrupt sequence above; clients without the capability (mobile,
  // voice) fall through to the legacy prompt-guidance path.
  //
  // The gate re-checks the raw question text (not just intent==='compute'):
  // on multi-turn threads the vague-follow-up confidence penalty pushes the
  // tabular heuristic below threshold and the LLM classifies follow-ups
  // like "durchschnittlicher umsatz pro region?" as search/produktion — which
  // silently degraded them to the legacy prompt-guidance path. Guards:
  // only hijackable intents (explicit tool intents like chart/image/
  // sharepic/web keep their flow), no @-forced tools, and the matcher
  // itself excludes text-metric ("wie viele zeichen") and visualization
  // questions.
  const computeOverridableIntents = new Set([
    'compute',
    'produktion',
    'direct',
    'search',
    'summary',
    'compare',
  ]);
  // "Fill this in" takes precedence over the aggregation match: "trag die
  // Summe ein" is both, and writing the value into the sheet is the
  // stronger ask. Same interrupt, but codegen switches to openpyxl so the
  // template's formatting and formulas survive.
  const isSheetFill =
    computeOverridableIntents.has(classifiedState.intent) && isSheetFillRequest(lastUserText);
  const isTabularCompute =
    !isSheetFill &&
    computeOverridableIntents.has(classifiedState.intent) &&
    isTabularComputeQuestion(lastUserText);
  // Chart requests over an attached table compute their values FIRST —
  // without this the model invents the aggregation (beta: the category
  // split in the bar chart was fabricated). Intent stays 'chart'; the
  // resumed respond step builds the chart JSON from BERECHNUNGSERGEBNIS.
  const isTabularChart = classifiedState.intent === 'chart';
  if (
    (isSheetFill || isTabularCompute || isTabularChart) &&
    classifiedState.hasTabularAttachment &&
    !forcedTools?.length &&
    clientTools?.includes('run_python') &&
    actualThreadId != null
  ) {
    const { pythonCode, computeFailed } = await pandasComputeNode(
      classifiedState,
      isSheetFill ? { mode: 'fill' } : {}
    );
    // Codegen failed (as opposed to the model judging the question
    // unrelated to the table, which is a legitimate silent skip). Without
    // telling the model, it answers the numeric question from the truncated
    // table text — the hallucination this node exists to prevent.
    if (computeFailed) {
      sendChatWarning(sse, 'compute_failed');
      classifiedState.degradationNotes = [
        ...(classifiedState.degradationNotes ?? []),
        {
          code: 'compute_failed',
          modelHint:
            'Die Berechnung auf der Tabelle ist fehlgeschlagen. Rechne NICHT selbst und nenne keine Zahlen aus der Tabelle — sag ehrlich, dass die Auswertung gerade nicht möglich war.',
        },
      ];
    }
    if (pythonCode) {
      log.info(
        `[ChatGraph] run_python interrupt (${pythonCode.length} chars ${isSheetFill ? 'openpyxl fill' : 'pandas'} code)`
      );
      if (!isTabularChart) {
        // The resumed respond step should use the compute-mode guidance
        // even when the classifier had picked a different intent — and the
        // client already received the original intent event, so send a
        // corrective one before the tool card appears.
        classifiedState.intent = 'compute';
        sse.send('intent', {
          intent: 'compute',
          message: getIntentMessage('compute'),
          reasoning: isSheetFill ? 'Formular-Ausfüllen erkannt' : 'Tabellen-Berechnung erkannt',
        });
      }
      // Stashed for the error-correction round: if the client reports a
      // failed execution, the resume handler regenerates with this code +
      // the error message in context.
      classifiedState.pandasLastCode = pythonCode;
      classifiedState.pandasComputeMode = isSheetFill ? 'fill' : 'analyze';

      const stepId = `run_python_${Date.now()}`;
      sse.sendRaw('thinking_step', {
        stepId,
        toolName: 'run_python',
        title: isSheetFill ? 'Fülle Vorlage aus…' : 'Berechne mit pandas…',
        status: 'in_progress',
        args: { code: pythonCode },
      });

      const suspended = await suspendTurn({
        ...suspendBase,
        forcedTool,
        threadId: actualThreadId,
        interrupt: {
          interruptType: 'client_tool',
          toolName: 'run_python',
          args: { code: pythonCode },
          threadId: actualThreadId,
        },
      });
      return { handled: true, result: suspended };
    }
    // Codegen failed — continue with the normal pipeline (prompt guidance
    // still steers the model toward an auto-run code block).
  }

  return { handled: false };
}
