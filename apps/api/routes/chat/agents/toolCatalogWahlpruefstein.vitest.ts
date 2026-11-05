/**
 * `gruenerator_wahlpruefstein_examples` steht nur auf Turns, auf denen das
 * Rezept `wahlpruefstein` gilt — sonst zahlte die Beschreibung auf jeden
 * werkzeugtragenden Aufruf ein (Deckel: toolScopeBudget.vitest.ts).
 */
import { describe, expect, it } from 'vitest';

import { createSourceRegistry } from '../services/agenticLoop/sourceRegistry.js';

import { buildChatToolCatalog } from './toolCatalog.js';

import type { AgentConfig } from './types.js';
import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { SSEWriter } from '../services/sseHelpers.js';

const sse = new Proxy({}, { get: () => () => undefined }) as unknown as SSEWriter;
const TOOL = 'gruenerator_wahlpruefstein_examples';

function mounted(agent: Partial<AgentConfig>, activeSkillMention: string | null): boolean {
  const state = {
    userLocale: 'de-DE',
    intent: 'agentic',
    messages: [],
    lastUserTextNoMentions: 'Beantworte diesen Katalog.',
    activeSkillMention,
  } as unknown as ChatGraphState;
  const { tools } = buildChatToolCatalog({
    agentConfig: { identifier: 'gruenerator-universal', ...agent } as unknown as AgentConfig,
    sourceRegistry: createSourceRegistry(),
    loop: { sse, state, req: {} as never, threadId: 't1' },
  });
  return TOOL in tools;
}

describe(TOOL, () => {
  it('steht auf einem Turn mit gewähltem Rezept', () => {
    expect(mounted({}, 'wahlpruefstein')).toBe(true);
  });

  it('steht beim Agenten, dessen Default das Rezept ist', () => {
    expect(
      mounted(
        { identifier: 'gruenerator-wahlpruefsteine', defaultRecipeMention: 'wahlpruefstein' },
        null
      )
    ).toBe(true);
  });

  it('fehlt auf jedem anderen Turn', () => {
    expect(mounted({}, null)).toBe(false);
    expect(mounted({}, 'presse')).toBe(false);
  });
});
