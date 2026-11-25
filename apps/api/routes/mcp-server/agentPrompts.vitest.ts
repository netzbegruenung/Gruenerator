/**
 * The registry carries `systemRole: ''` for every system agent — the persona
 * lives in the intern repo. The MCP prompts must resolve it the way the chat
 * does, or every client gets a system prompt without identity (#6004).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../services/skills/internalPrompts.js', () => ({
  getInternalAgentPrompt: (id: string) => `PERSONA ${id}`,
}));

const { registerAgentPrompts } = await import('./agentPrompts.js');

type PromptHandler = (args: Record<string, string>) => {
  messages: { content: { text: string } }[];
};

function collectPrompts(): Map<string, PromptHandler> {
  const prompts = new Map<string, PromptHandler>();
  const server = {
    registerPrompt: (name: string, _meta: unknown, handler: PromptHandler) => {
      prompts.set(name, handler);
    },
  };
  registerAgentPrompts(server as unknown as Parameters<typeof registerAgentPrompts>[0]);
  return prompts;
}

describe('MCP agent prompts', () => {
  it('ship the persona from the intern repo instead of an empty system role', () => {
    const prompts = collectPrompts();
    const handler = prompts.get('wahlprogramm');
    expect(handler).toBeDefined();

    const first = handler!({ message: 'Hallo', country: 'DE' }).messages[0].content.text;
    expect(first).toContain('PERSONA gruenerator-wahlprogramm');
  });
});
