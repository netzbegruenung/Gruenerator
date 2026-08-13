/**
 * The deep research agent: plan → delegate → read → report.
 *
 * Built on `deepagents` (LangChain), which is a second runtime alongside the AI
 * SDK the rest of the chat uses. That is deliberate and scoped: this agent owns
 * three tools of its own, so there is no bridge to build between the two tool
 * protocols — the reason a wholesale move was declined in July.
 *
 * The caller owns the hard deadline and the quota; this module owns the budget,
 * the progress reporting and the report extraction.
 */

import { createDeepAgent } from 'deepagents';
import { todoListMiddleware } from 'langchain';

import { createLogger } from '../../../utils/logger.js';

import { describeFinalState } from './finalState.js';
import { suppressGeneralPurposeSubagent } from './harnessProfile.js';
import { leadModel, workerModel } from './models.js';
import { nudgeMissingReportMiddleware } from './nudgeMissingReport.js';
import { leadPrompt, programmeResearcherPrompt, webResearcherPrompt } from './prompts.js';
import {
  REPORT_PATH,
  ensureSources,
  extractTitle,
  isUsableReport,
  markPartial,
  readFile,
  stripInternalReferences,
  summaryFromReport,
} from './report.js';
import {
  RESUME_LIMIT,
  WRAP_UP_RECURSION_LIMIT,
  buildResumeInput,
  classifyRunError,
} from './resume.js';
import { sanitizeToolCallsMiddleware } from './sanitizeToolCalls.js';
import { type ToolContext } from './toolContext.js';
import { createResearchTools, toolsFor } from './tools.js';
import {
  DEFAULT_BUDGET,
  createBudget,
  type DeepAgentRunParams,
  type DeepAgentRunResult,
  type ResearchStep,
  type SourceRef,
} from './types.js';

const log = createLogger('DeepAgent');

interface TodoItem {
  content?: string;
  status?: string;
}

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
    label: t.content ?? `Schritt ${i + 1}`,
    status: t.status === 'completed' ? 'done' : 'running',
  }));
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
  const sources = new Map<string, SourceRef>();
  const budget = createBudget(Date.now());

  // The research clock. It lives HERE and not at the caller because one
  // deadline cannot both stop the research and leave time to write it down —
  // the run of 11.08.2026 died mid-wrap-up with 83 sources in hand. The
  // caller's signal stays the hard kill and is the longer one (hardMs+wrapUpMs).
  const researchDeadline = AbortSignal.timeout(DEFAULT_BUDGET.hardMs);
  const researchSignal = signal ? AbortSignal.any([signal, researchDeadline]) : researchDeadline;

  const stepIds = new Map<string, string>();
  const ctx: ToolContext = {
    budget,
    locale,
    sources,
    // Cuts a waiting tool (the GreenPT spacing gate, a retry pause) short with
    // the research clock instead of letting it outlive its own run.
    signal: researchSignal,
    ...(params.aiWorkerPool ? { aiWorkerPool: params.aiWorkerPool } : {}),
    ...(params.notebookScope ? { notebooks: params.notebookScope } : {}),
    onStep: (label, status) => {
      let id = stepIds.get(label);
      if (!id) {
        id = `step-${stepIds.size}`;
        stepIds.set(label, id);
      }
      progress.onStep({ id, label, status });
    },
  };

  const tools = createResearchTools(ctx);
  // Read off the built tools, not off `params`: the corpus tool only exists when
  // something is actually in reach (`buildNotebookScope`), and both things that
  // depend on it — the second subagent and the lead's prompt — must follow that
  // one fact instead of re-deriving it.
  const hasNotebooks = tools.some((t) => t.name === 'notizbuch_suche');
  // Without this the run has a SECOND delegation target — on the lead model,
  // with a generic prompt, advertising itself for research. See harnessProfile.ts.
  suppressGeneralPurposeSubagent();
  // `deepagents` and `langchain` each declare their own tool/middleware shapes,
  // and under `exactOptionalPropertyTypes` the two do not line up structurally
  // (langchain's DynamicStructuredTool lacks the index signature deepagents'
  // ServerTool demands). Both values come from the LangChain packages themselves
  // and are correct at runtime — verified end to end on 10.08.2026 — so this is
  // a boundary assertion between two libraries, not a hole in our own types.
  const agent = createDeepAgent({
    name: 'gruenerator-tiefenbericht',
    model: leadModel(),
    tools: tools as never,
    // The nudge is lead-only: the researcher subagent answers in its message
    // and never owes a /bericht.md, so pushing it back would be wrong there.
    middleware: [
      todoListMiddleware(),
      sanitizeToolCallsMiddleware,
      nudgeMissingReportMiddleware,
    ] as never,
    systemPrompt: leadPrompt(locale, { hasNotebooks }),
    subagents: [
      {
        name: 'web-recherche',
        description:
          'Beantwortet EINE faktische Teilfrage im Web — Zahlen, Daten, Chronologie, fremde Akteure — mit Quellenangaben. Gib die vollständige Teilfrage samt Kontext mit; der Subagent kennt den Gesamtauftrag nicht.',
        systemPrompt: webResearcherPrompt(locale),
        // Not the lead's list: the expensive deep lane stays a lead decision,
        // and the corpora belong to the other researcher. See SUBAGENT_TOOLSETS.
        tools: toolsFor(tools, 'web-recherche') as never,
        model: workerModel(),
        // Subagents do not inherit the main agent's middleware, and they run the
        // same lane — so the repair has to be attached here too.
        middleware: [sanitizeToolCallsMiddleware] as never,
      },
      // Only when a corpus is actually in reach: without `notizbuch_suche` this
      // subagent has nothing to search, and an empty specialist is worse than
      // none — the lead would delegate programme questions into a dead end.
      ...(hasNotebooks
        ? [
            {
              name: 'programm-recherche',
              description:
                'Beantwortet EINE Teilfrage zu grüner Haltung, Beschlusslage oder Programmatik aus den Programmen und Beschlüssen der Grünen selbst. Gib die vollständige Teilfrage samt Kontext mit; der Subagent kennt den Gesamtauftrag nicht.',
              systemPrompt: programmeResearcherPrompt(locale),
              tools: toolsFor(tools, 'programm-recherche') as never,
              model: workerModel(),
              middleware: [sanitizeToolCallsMiddleware] as never,
            },
          ]
        : []),
    ],
  });

  // The `as never` above collapses the agent's inferred generics, which makes
  // its `stream` input type degrade to `Command`. We only ever use this one
  // method, so the surface we depend on is stated here instead.
  const runnable = agent as unknown as {
    stream: (
      input: Record<string, unknown>,
      options: Record<string, unknown>
    ) => Promise<AsyncIterable<Record<string, unknown>>>;
  };

  let lastState: Record<string, unknown> | null = null;
  let aborted = false;
  // streamMode 'values' emits each state twice (once per graph node); only
  // forward a plan when it actually changed, or the sidebar flickers.
  let lastPlanKey = '';

  // A dead stream is resumed from its last emitted state instead of being
  // written off: transient runtime errors get RESUME_LIMIT fresh attempts, and
  // both budget ceilings — step count and research clock — get the same short
  // wrap-up leg, whose only job is writing the report. See resume.ts.
  let input: Record<string, unknown> = { messages: [{ role: 'user', content: question }] };
  let recursionLimit: number = DEFAULT_BUDGET.recursionLimit;
  let transientResumes = 0;
  let wrapUpUsed = false;
  // The wrap-up leg must not inherit the deadline that just fired — it would
  // abort on its first model call — so from then on only the caller's signal
  // guards the run.
  let legSignal: AbortSignal | undefined = researchSignal;

  for (;;) {
    try {
      const stream = await runnable.stream(input, {
        recursionLimit,
        streamMode: 'values',
        ...(legSignal ? { signal: legSignal } : {}),
      });
      for await (const chunk of stream) {
        lastState = chunk as Record<string, unknown>;
        const todos = (chunk as { todos?: TodoItem[] }).todos ?? [];
        if (todos.length > 0) {
          const key = todos.map((t) => `${t.content}:${t.status}`).join('|');
          if (key !== lastPlanKey) {
            lastPlanKey = key;
            progress.onPlan(planSteps(todos));
          }
        }
      }
      break;
    } catch (error) {
      const kind = classifyRunError(error, signal, researchDeadline);
      const isWrapUp = kind === 'recursion' || kind === 'deadline';
      if (
        kind === 'fatal' ||
        (kind === 'transient' && transientResumes >= RESUME_LIMIT) ||
        (isWrapUp && wrapUpUsed)
      ) {
        aborted = true;
        log.warn(`[DeepAgent] Lauf abgebrochen (${kind}): ${String(error)}`);
        break;
      }
      if (isWrapUp) {
        wrapUpUsed = true;
        recursionLimit = WRAP_UP_RECURSION_LIMIT;
        // Past the research deadline the tools refuse anyway, and the leg that
        // writes the report gets its own allowance from the caller's signal.
        legSignal = signal;
      } else {
        transientResumes += 1;
      }
      input = buildResumeInput(lastState, kind) ?? {
        messages: [{ role: 'user', content: question }],
      };
      log.warn(
        `[DeepAgent] Lauf unterbrochen (${kind}, Fortsetzung ${transientResumes}/${RESUME_LIMIT}${wrapUpUsed ? ', Wrap-up' : ''}): ${String(error)}`
      );
    }
  }

  const raw = readFile(lastState?.files, REPORT_PATH);
  if (!isUsableReport(raw)) {
    // The interesting part is WHY the loop stopped — a refusal, a direct
    // answer, empty content — and that lives only in the final message.
    log.warn(
      `[DeepAgent] Kein verwertbarer Bericht (abgebrochen=${aborted}) — ${describeFinalState(lastState)}`
    );
    return null;
  }

  const sourceList = [...sources.values()];
  let markdown = ensureSources(raw.trim(), sourceList);
  if (aborted) markdown = markPartial(markdown);

  return {
    markdown,
    title: extractTitle(markdown, question.slice(0, 120)),
    summary: finalSummary(lastState, question, markdown),
    partial: aborted,
    sources: sourceList,
  };
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
function finalSummary(
  state: Record<string, unknown> | null,
  question: string,
  markdown: string
): string {
  const messages = (state?.messages ?? []) as { content?: unknown; getType?: () => string }[];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg?.getType?.() !== 'ai') continue;
    const content = typeof msg.content === 'string' ? stripInternalReferences(msg.content) : '';
    if (content.length > 40) return content;
  }
  return (
    summaryFromReport(markdown) ?? `Die Recherche zu „${question.slice(0, 120)}" ist abgeschlossen.`
  );
}

export { DEFAULT_BUDGET } from './types.js';
export type { DeepAgentRunResult, ResearchStep } from './types.js';
