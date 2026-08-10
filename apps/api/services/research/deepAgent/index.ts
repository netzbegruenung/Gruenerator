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

import { leadModel, workerModel } from './models.js';
import { leadPrompt, researcherPrompt } from './prompts.js';
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
import { sanitizeToolCallsMiddleware } from './sanitizeToolCalls.js';
import { createResearchTools, type ToolContext } from './tools.js';
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

  const stepIds = new Map<string, string>();
  const ctx: ToolContext = {
    budget,
    locale,
    sources,
    ...(params.aiWorkerPool ? { aiWorkerPool: params.aiWorkerPool } : {}),
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
    middleware: [todoListMiddleware(), sanitizeToolCallsMiddleware] as never,
    systemPrompt: leadPrompt(locale),
    subagents: [
      {
        name: 'recherche',
        description:
          'Beantwortet EINE Teilfrage gründlich mit Websuche und Quellenangaben. Gib die vollständige Teilfrage samt Kontext mit — der Subagent kennt den Gesamtauftrag nicht.',
        systemPrompt: researcherPrompt(locale),
        tools: tools as never,
        model: workerModel(),
        // Subagents do not inherit the main agent's middleware, and they run the
        // same lane — so the repair has to be attached here too.
        middleware: [sanitizeToolCallsMiddleware] as never,
      },
    ],
  });

  // The `as never` above collapses the agent's inferred generics, which makes
  // its `stream` input type degrade to `Command`. We only ever use this one
  // method, so the surface we depend on is stated here instead.
  const runnable = agent as unknown as {
    stream: (
      input: { messages: { role: string; content: string }[] },
      options: Record<string, unknown>
    ) => Promise<AsyncIterable<Record<string, unknown>>>;
  };

  let lastState: Record<string, unknown> | null = null;
  let aborted = false;
  // streamMode 'values' emits each state twice (once per graph node); only
  // forward a plan when it actually changed, or the sidebar flickers.
  let lastPlanKey = '';

  try {
    const stream = await runnable.stream(
      { messages: [{ role: 'user', content: question }] },
      {
        recursionLimit: DEFAULT_BUDGET.recursionLimit,
        streamMode: 'values',
        ...(signal ? { signal } : {}),
      }
    );
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
  } catch (error) {
    aborted = true;
    log.warn(`[DeepAgent] Lauf abgebrochen: ${String(error)}`);
  }

  const raw = readFile(lastState?.files, REPORT_PATH);
  if (!isUsableReport(raw)) {
    log.warn(`[DeepAgent] Kein verwertbarer Bericht (abgebrochen=${aborted})`);
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
