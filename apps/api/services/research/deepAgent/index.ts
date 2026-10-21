/**
 * The deep research agent: plan → delegate → read → report.
 *
 * Runs on the AI SDK like the rest of the app. Until 10/2026 it ran on
 * `deepagents` (LangChain) as a second runtime; what that harness provided —
 * the plan, the virtual files, delegation to subagents, the middleware hooks —
 * is now a handful of plain tools and this loop (workspace.ts, subagents.ts,
 * sanitizeToolCalls.ts, nudgeMissingReport.ts).
 *
 * The caller owns the hard deadline and the quota; this module owns the budget,
 * the progress reporting and the report extraction.
 */

import { randomUUID } from 'node:crypto';

import { generateText, isStepCount, type ModelMessage, type ToolSet } from 'ai';

import { createLogger } from '../../../utils/logger.js';
import { buildAiTelemetry } from '../../telemetry/langfuseTelemetry.js';

import { describeFinalState } from './finalState.js';
import { leadModel, workerModel } from './models.js';
import { nudgeForMissingReport } from './nudgeMissingReport.js';
import { leadPrompt, programmeResearcherPrompt, webResearcherPrompt } from './prompts.js';
import {
  REPORT_PATH,
  ensureSources,
  extractTitle,
  isUsableReport,
  markPartial,
  stripInternalReferences,
  summaryFromReport,
} from './report.js';
import { RESUME_LIMIT, WRAP_UP_STEPS, classifyRunError, resumeMessages } from './resume.js';
import { getRun, recordRunFinished, recordRunStarted, recordRunState } from './runRegistry.js';
import { sanitizeStep } from './sanitizeToolCalls.js';
import { createTaskTool, type SubagentSpec } from './subagents.js';
import { withResearchTrace } from './telemetry.js';
import { type ToolContext } from './toolContext.js';
import { createResearchTools } from './tools.js';
import {
  DEFAULT_BUDGET,
  createBudget,
  type DeepAgentRunParams,
  type DeepAgentRunResult,
  type ResearchStep,
  type SavedRunState,
  type SourceRef,
} from './types.js';
import { createWorkspaceTools, emptyWorkspace, type TodoItem } from './workspace.js';

const log = createLogger('DeepAgent');

/** What the wrap-up leg may still do: write the report, nothing else. */
const WRAP_UP_TOOLS = ['write_file', 'read_file'];

/**
 * `write_todos` items → the steps the sidebar knows.
 *
 * Only `completed` is distinguished: `pending` and `in_progress` both render as
 * running, because a plan item the agent has not reached yet is still work the
 * user is waiting on, and showing it differently only invites the question why
 * nothing is happening to it.
 */
function planSteps(todos: TodoItem[]): ResearchStep[] {
  return todos.map((t, i) => ({
    id: `plan-${i}`,
    label: t.content || `Schritt ${i + 1}`,
    status: t.status === 'completed' ? 'done' : 'running',
  }));
}

/**
 * The researchers the lead can delegate to.
 *
 * `programm-recherche` only when a corpus is actually in reach: without
 * `notebook_suche` it has nothing to search, and an empty specialist is worse
 * than none — the lead would delegate programme questions into a dead end.
 */
function subagentsFor(
  locale: DeepAgentRunParams['locale'],
  hasNotebooks: boolean
): [SubagentSpec, ...SubagentSpec[]] {
  const web: SubagentSpec = {
    name: 'web-recherche',
    description:
      'Beantwortet EINE faktische Teilfrage im Web — Zahlen, Daten, Chronologie, fremde Akteure — mit Quellenangaben. Gib die vollständige Teilfrage samt Kontext mit; der Subagent kennt den Gesamtauftrag nicht.',
    prompt: webResearcherPrompt(locale),
  };
  if (!hasNotebooks) return [web];
  return [
    web,
    {
      name: 'programm-recherche',
      description:
        'Beantwortet EINE Teilfrage zu grüner Haltung, Beschlusslage oder Programmatik aus den Programmen und Beschlüssen der Grünen selbst. Gib die vollständige Teilfrage samt Kontext mit; der Subagent kennt den Gesamtauftrag nicht.',
      prompt: programmeResearcherPrompt(locale),
    },
  ];
}

/**
 * The saved state of a run to continue, or null when there is none.
 *
 * The cast is the boundary assertion: the column is JSON this module wrote
 * itself (`recordRunState`), and nothing else writes it.
 */
async function loadSavedState(threadId: string): Promise<SavedRunState | null> {
  const row = await getRun(threadId);
  const state = row?.state as SavedRunState | null | undefined;
  return state && Array.isArray(state.messages) && state.messages.length > 0 ? state : null;
}

/**
 * Runs one research job.
 *
 * Never throws for research-shaped failures: a run that dies mid-way still
 * returns whatever report exists, flagged `partial`, so the caller can decide
 * whether to file it. Only a missing API key (a configuration fault) escapes.
 */
export async function runDeepAgentResearch(
  params: DeepAgentRunParams
): Promise<DeepAgentRunResult | null> {
  const { question, locale, progress, signal } = params;
  const limits = params.budget ?? DEFAULT_BUDGET;
  const sources = new Map<string, SourceRef>();
  const budget = createBudget(Date.now(), limits);

  // The research clock. It lives HERE and not at the caller because one
  // deadline cannot both stop the research and leave time to write it down —
  // the run of 11.08.2026 died mid-wrap-up with 83 sources in hand. The
  // caller's signal stays the hard kill and is the longer one (hardMs+wrapUpMs).
  const researchDeadline = AbortSignal.timeout(limits.hardMs);
  const researchSignal = signal ? AbortSignal.any([signal, researchDeadline]) : researchDeadline;

  // A step can still settle after the run is over (a researcher finishing
  // behind an abort). Emitting it then would push into a closed SSE stream —
  // this is the one gate that stops it.
  let progressClosed = false;
  const emitStep = (step: ResearchStep): void => {
    if (!progressClosed) progress.onStep(step);
  };

  const stepIds = new Map<string, string>();
  const ctx: ToolContext = {
    budget,
    locale,
    sources,
    // Cuts a waiting tool (the GreenPT spacing gate, a retry pause) short with
    // the research clock instead of letting it outlive its own run.
    signal: researchSignal,
    ...(params.notebookScope ? { notebooks: params.notebookScope } : {}),
    onStep: (label, status) => {
      let id = stepIds.get(label);
      if (!id) {
        id = `step-${stepIds.size}`;
        stepIds.set(label, id);
      }
      emitStep({ id, label, status });
    },
  };

  const tools = createResearchTools(ctx);
  // Read off the built tools, not off `params`: the corpus tool only exists when
  // something is actually in reach (`buildNotebookScope`), and both things that
  // depend on it — the second subagent and the lead's prompt — must follow that
  // one fact instead of re-deriving it.
  const hasNotebooks = 'notebook_suche' in tools;
  const lead = leadModel();
  const worker = workerModel();

  // Per RUN, not per chat thread: two researches in one conversation are two
  // independent histories, and sharing an id would make the second resume
  // into the first.
  const threadId = params.threadId ?? `research-${randomUUID()}`;
  const saved = params.threadId ? await loadSavedState(params.threadId) : null;
  log.info(`[DeepAgent] Lauf ${threadId}${saved ? ' (Fortsetzung)' : ''}`);
  await recordRunStarted({
    threadId,
    question,
    locale,
    ...(params.userId ? { userId: params.userId } : {}),
  });

  const workspace = saved?.workspace ?? emptyWorkspace();
  const leadTools: ToolSet = {
    ...tools,
    ...createWorkspaceTools(workspace, (todos) => {
      if (!progressClosed) progress.onPlan(planSteps(todos));
    }),
    task: createTaskTool({
      subagents: subagentsFor(locale, hasNotebooks),
      tools,
      worker,
      steps: limits.workerSteps,
      onStep: emitStep,
    }),
  };
  const instructions = leadPrompt(locale, { hasNotebooks });
  const telemetry = buildAiTelemetry('deep-research.lead');

  // The history grows step by step, and only a finished step joins it — so it
  // is always a valid conversation to continue from, whatever killed the leg.
  // A continued run opens with what happened instead of the question, or the
  // model would re-plan and re-delegate work already paid for.
  let history: ModelMessage[] = saved
    ? resumeMessages(saved.messages, 'restart')
    : [{ role: 'user', content: question }];

  // Saves run one after another, each with the state of its own step.
  let saving: Promise<void> = Promise.resolve();
  const save = (): void => {
    const state: SavedRunState = {
      messages: history,
      workspace: { todos: [...workspace.todos], files: { ...workspace.files } },
    };
    saving = saving.then(() => recordRunState(threadId, state));
  };

  let stepsLeft = limits.leadSteps;
  let activeTools: string[] | null = null;
  let transientResumes = 0;
  let wrapUpUsed = false;
  let aborted = false;
  // The wrap-up leg must not inherit the deadline that just fired — it would
  // abort on its first model call — so from then on only the caller's signal
  // guards the run.
  let legSignal: AbortSignal | undefined = researchSignal;

  const startWrapUp = (reason: 'steps' | 'deadline'): void => {
    wrapUpUsed = true;
    stepsLeft = WRAP_UP_STEPS;
    activeTools = WRAP_UP_TOOLS;
    // Past the research deadline the tools refuse anyway, and the leg that
    // writes the report gets its own allowance from the caller's signal.
    legSignal = signal;
    history = resumeMessages(history, reason);
  };

  await withResearchTrace(
    { threadId, ...(params.userId ? { userId: params.userId } : {}) },
    async () => {
      // A dead leg is resumed from the history instead of being written off:
      // transient runtime errors get RESUME_LIMIT fresh attempts, and both
      // budget ceilings — step count and research clock — get the same short
      // wrap-up leg, whose only job is writing the report. See resume.ts.
      for (;;) {
        try {
          const result = await generateText({
            model: lead.model,
            temperature: lead.temperature,
            providerOptions: lead.providerOptions,
            instructions,
            messages: history,
            tools: leadTools,
            ...(activeTools ? { activeTools } : {}),
            stopWhen: isStepCount(Math.max(stepsLeft, 1)),
            prepareStep: sanitizeStep,
            ...(legSignal ? { abortSignal: legSignal } : {}),
            ...(telemetry ? { experimental_telemetry: telemetry } : {}),
            onStepFinish: (step) => {
              history = [...history, ...step.response.messages];
              stepsLeft -= 1;
              save();
            },
          });

          // Still calling tools when the steps ran out: the budget, not the
          // model, ended the leg.
          if (result.finishReason === 'tool-calls') {
            if (wrapUpUsed) {
              aborted = true;
              log.warn('[DeepAgent] Lauf abgebrochen: Schrittbudget auch im Wrap-up erschöpft');
              break;
            }
            log.warn('[DeepAgent] Schrittbudget erschöpft — Wrap-up');
            startWrapUp('steps');
            continue;
          }
          // The model ended its turn. Without a report it is pushed back to
          // work, bounded — see nudgeMissingReport.ts.
          const nudge =
            wrapUpUsed || stepsLeft <= 0 ? null : nudgeForMissingReport(history, workspace.files);
          if (!nudge) break;
          history = [...history, nudge];
        } catch (error) {
          const kind = classifyRunError(error, signal, researchDeadline);
          if (
            kind === 'fatal' ||
            (kind === 'transient' && transientResumes >= RESUME_LIMIT) ||
            (kind === 'deadline' && wrapUpUsed)
          ) {
            aborted = true;
            log.warn(`[DeepAgent] Lauf abgebrochen (${kind}): ${String(error)}`);
            break;
          }
          if (kind === 'deadline') startWrapUp('deadline');
          else transientResumes += 1;
          log.warn(
            `[DeepAgent] Lauf unterbrochen (${kind}, Fortsetzung ${transientResumes}/${RESUME_LIMIT}${wrapUpUsed ? ', Wrap-up' : ''}): ${String(error)}`
          );
        }
      }
    }
  );

  progressClosed = true;
  await saving;

  const raw = workspace.files[REPORT_PATH] ?? null;
  if (!isUsableReport(raw)) {
    // Left as `failed`, NOT deleted: this row plus its state is the whole
    // material a resume would work from.
    await recordRunFinished({ threadId, status: 'failed' });
    // The interesting part is WHY the loop stopped — a refusal, a direct
    // answer, empty content — and that lives only in the final message.
    log.warn(
      `[DeepAgent] Kein verwertbarer Bericht (abgebrochen=${aborted}) — ${describeFinalState(history)}`
    );
    return null;
  }

  await recordRunFinished({ threadId, status: 'finished', partial: aborted });

  const sourceList = [...sources.values()];
  let markdown = ensureSources(raw.trim(), sourceList);
  if (aborted) markdown = markPartial(markdown);

  return {
    markdown,
    threadId,
    title: extractTitle(markdown, question.slice(0, 120)),
    summary: finalSummary(history, question, markdown),
    partial: aborted,
    sources: sourceList,
  };
}

/** Plain text of an assistant message, tool calls and reasoning left out. */
function assistantText(message: ModelMessage): string {
  if (message.role !== 'assistant') return '';
  if (typeof message.content === 'string') return message.content;
  return message.content
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('')
    .trim();
}

/**
 * The two or three sentences the chat shows instead of the report.
 *
 * The agent's own closing message comes first, but it is regularly EMPTY: after
 * `write_file` the model considers the job delivered and says nothing. The
 * report's `## Zusammenfassung` is then the better source — it is the same
 * content, already written. Only if both are missing do we fall back to a
 * neutral sentence, because the last message of an aborted run is usually a tool
 * result and dumping that into the chat is worse than saying little.
 */
function finalSummary(messages: ModelMessage[], question: string, markdown: string): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (!msg) continue;
    const content = stripInternalReferences(assistantText(msg));
    if (content.length > 40) return content;
  }
  return (
    summaryFromReport(markdown) ?? `Die Recherche zu „${question.slice(0, 120)}" ist abgeschlossen.`
  );
}

export { DEFAULT_BUDGET } from './types.js';
export type { DeepAgentRunResult, ResearchStep } from './types.js';
