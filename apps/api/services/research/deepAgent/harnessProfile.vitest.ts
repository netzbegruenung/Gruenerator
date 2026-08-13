import { ChatOpenAI } from '@langchain/openai';
import { createDeepAgent } from 'deepagents';
import { describe, expect, it } from 'vitest';

import { suppressGeneralPurposeSubagent } from './harnessProfile.js';

/**
 * Measured against the real package, not a mock — the whole point is that
 * `deepagents` adds a subagent we never asked for, and only the assembled agent
 * can say whether it is gone. The `task` tool's description is where the
 * delegation targets are listed, so it is also the only thing the LEAD ever
 * sees about them.
 */
function taskToolDescription(agent: unknown): string {
  const middleware =
    (agent as { options?: { middleware?: { tools?: { name: string; description?: string }[] }[] } })
      .options?.middleware ?? [];
  for (const mw of middleware) {
    for (const t of mw.tools ?? []) {
      if (t.name === 'task') return t.description ?? '';
    }
  }
  throw new Error('kein task-Werkzeug gefunden — Aufbau von deepagents hat sich geändert');
}

/**
 * The delegation targets, not the whole description.
 *
 * Searching the raw text for a name gives a false positive: the boilerplate
 * usage notes below the list end with "When only general-purpose is available,
 * use it for any complex, context-heavy task" — a sentence that survives the
 * suppression and would have made this test pass while nothing was suppressed.
 */
function delegationTargets(agent: unknown): string[] {
  const section = taskToolDescription(agent).split('\nSpecify subagent_type')[0] ?? '';
  return [...section.matchAll(/^- ([\w-]+):/gm)].map((m) => m[1] as string);
}

function buildAgent() {
  return createDeepAgent({
    // No network call happens at construction; the key only has to be non-empty.
    model: new ChatOpenAI({
      apiKey: 'test',
      model: 'test-model',
      configuration: { baseURL: 'http://localhost' },
    }),
    tools: [],
    subagents: [
      { name: 'web-recherche', description: 'Beantwortet eine Teilfrage', systemPrompt: 'x' },
    ],
  });
}

describe('suppressGeneralPurposeSubagent', () => {
  /**
   * Both halves in one test on purpose: the registry is global and the call is
   * irreversible within a process, so "before" can only be observed once, and
   * the before-half is what justifies the after-half existing at all.
   */
  it('removes the built-in general-purpose delegation target', () => {
    // Before — the default the plan was written against. If this half ever
    // fails, the suppression became unnecessary and this module can go.
    expect(delegationTargets(buildAgent())).toEqual(['general-purpose', 'web-recherche']);

    suppressGeneralPurposeSubagent();

    // Our own subagent stays — a profile that suppressed everything would pass
    // a mere "not.toContain" and break the run.
    expect(delegationTargets(buildAgent())).toEqual(['web-recherche']);
  });

  it('is idempotent, because it runs once per research run', () => {
    suppressGeneralPurposeSubagent();
    suppressGeneralPurposeSubagent();
    expect(delegationTargets(buildAgent())).toEqual(['web-recherche']);
  });
});
