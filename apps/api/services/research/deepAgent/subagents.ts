/**
 * Delegation: the `task` tool and the researcher loop behind it.
 *
 * `deepagents` provided this as its subagent middleware. What it did, and what
 * this does the same way:
 *
 *  - The lead names a researcher and hands it ONE sub-question (`description`).
 *    The researcher sees nothing else — not the order, not the other
 *    sub-questions — which is why the prompt makes the lead spell out context.
 *  - The researcher runs its own loop on the worker lane with its own tool
 *    subset (`SUBAGENT_TOOLSETS`) and answers through `antwort_geben`; the lead
 *    receives that answer as the tool result, as JSON.
 *  - Several `task` calls in one lead turn run concurrently — the AI SDK runs a
 *    step's tool calls in parallel, which is the whole point of the lead's
 *    batching (see PARALLEL_TOOL_CALLS in models.ts).
 *
 * Like every tool here it never throws: a failed sub-question comes back as a
 * sentence the lead can act on.
 */

import { generateText, hasToolCall, isStepCount, tool, type ToolSet } from 'ai';
import { z } from 'zod';

import { createLogger } from '../../../utils/logger.js';
import { buildAiTelemetry } from '../../telemetry/langfuseTelemetry.js';

import { type ResearchModel } from './models.js';
import { ANSWER_TOOL_NAME, researcherAnswerTool } from './researcherResponse.js';
import { sanitizeStep } from './sanitizeToolCalls.js';
import { CUT_SHORT_NOTE, isAbort, subagentLabel } from './subagentProgress.js';
import { toolsFor, type SubagentName } from './tools.js';
import { type ResearchStep } from './types.js';

const log = createLogger('DeepAgentTask');

export interface SubagentSpec {
  name: SubagentName;
  /** What the lead reads to decide whom to delegate to. */
  description: string;
  /** The researcher's instructions. */
  prompt: string;
}

export interface TaskToolOptions {
  subagents: [SubagentSpec, ...SubagentSpec[]];
  tools: ToolSet;
  worker: ResearchModel;
  steps: number;
  onStep: (step: ResearchStep) => void;
}

/**
 * One researcher run. Returns the tool result the lead sees.
 *
 * On the last allowed step `antwort_geben` is the only tool left, so a
 * researcher that spends its budget hands back its answer instead of running
 * out mid-search. Offered, not forced: the Gemma lane ignores a forced tool
 * choice, and the AI SDK then throws `ToolChoiceViolationError`, which cost the
 * whole sub-question (measured 21.10.2026, two of eight delegations). A
 * researcher that ends on plain text is passed through as text — the lead reads
 * prose too, and dropping a finished answer for its format would be worse.
 */
async function runResearcher(
  spec: SubagentSpec,
  question: string,
  options: TaskToolOptions,
  abortSignal: AbortSignal | undefined
): Promise<string> {
  const { worker, steps } = options;
  const telemetry = buildAiTelemetry(`deep-research.${spec.name}`);
  const result = await generateText({
    model: worker.model,
    temperature: worker.temperature,
    providerOptions: worker.providerOptions,
    instructions: spec.prompt,
    messages: [{ role: 'user', content: question }],
    tools: { ...toolsFor(options.tools, spec.name), [ANSWER_TOOL_NAME]: researcherAnswerTool() },
    stopWhen: [isStepCount(steps), hasToolCall(ANSWER_TOOL_NAME)],
    prepareStep: ({ messages, stepNumber }) => {
      const sanitized = sanitizeStep({ messages });
      if (stepNumber < steps - 1) return sanitized;
      return { ...sanitized, activeTools: [ANSWER_TOOL_NAME] };
    },
    ...(abortSignal ? { abortSignal } : {}),
    ...(telemetry ? { experimental_telemetry: telemetry } : {}),
  });

  const answer = result.steps
    .flatMap((step) => step.toolCalls)
    .find((call) => call.toolName === ANSWER_TOOL_NAME && !call.invalid);
  if (answer) return JSON.stringify(answer.input);

  log.warn(`[task] ${spec.name} endete ohne ${ANSWER_TOOL_NAME} — Antwort als Text`);
  return result.text.trim() || 'Die Teilrecherche hat kein Ergebnis geliefert.';
}

export function createTaskTool(options: TaskToolOptions) {
  const names = options.subagents.map((s) => s.name) as [SubagentName, ...SubagentName[]];
  const byName = new Map(options.subagents.map((s) => [s.name, s]));
  const roster = options.subagents.map((s) => `- \`${s.name}\`: ${s.description}`).join('\n');

  return tool({
    description: `Vergibt EINE Teilfrage an einen Subagenten, der sie selbständig recherchiert und sein Ergebnis zurückgibt. Mehrere Aufrufe in einem Zug laufen gleichzeitig.\n\nVerfügbare Subagenten:\n${roster}`,
    inputSchema: z.object({
      subagent_type: z.enum(names).describe('Welcher Subagent die Teilfrage bearbeitet'),
      description: z
        .string()
        .describe(
          'Die vollständige Teilfrage samt nötigem Kontext — der Subagent sieht sonst nichts'
        ),
    }),
    execute: async (
      { subagent_type, description },
      { toolCallId, abortSignal }
    ): Promise<string> => {
      const spec = byName.get(subagent_type);
      if (!spec) return `Unbekannter Subagent ${subagent_type}.`;
      const id = `sub-${toolCallId}`;
      options.onStep({ id, label: subagentLabel(spec.name, description), status: 'running' });
      try {
        const answer = await runResearcher(spec, description, options, abortSignal);
        options.onStep({ id, label: subagentLabel(spec.name, description), status: 'done' });
        return answer;
      } catch (error) {
        const cut = isAbort(error) || abortSignal?.aborted === true;
        options.onStep({
          id,
          label: subagentLabel(spec.name, description, cut ? CUT_SHORT_NOTE : undefined),
          status: 'failed',
        });
        // An abort is the run's deadline, and the run's own loop handles it —
        // rethrown so the step dies with the deadline instead of carrying on.
        if (cut) throw error;
        log.warn(`[task] ${spec.name} fehlgeschlagen: ${String(error)}`);
        return 'Diese Teilrecherche ist fehlgeschlagen. Vergib die Teilfrage neu oder arbeite mit dem vorhandenen Material weiter.';
      }
    },
  });
}
