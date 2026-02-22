import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { AGENTS, SOCIAL_MEDIA_VARIANTS, type McpAgentDefinition } from './agent-data.ts';

const TOOL_NAME_MAP: Record<string, string> = {
  search: 'gruenerator_search',
  search_documents: 'gruenerator_search',
  web: '(web search — nicht als MCP Tool verfügbar, wird vom Client bereitgestellt)',
  web_search: '(web search — nicht als MCP Tool verfügbar, wird vom Client bereitgestellt)',
  examples: 'gruenerator_examples_search',
  search_examples: 'gruenerator_examples_search',
};

function getMcpToolHints(enabledTools?: string[]): string {
  if (!enabledTools || enabledTools.length === 0) return '';

  const mappedTools = enabledTools
    .filter((t) => TOOL_NAME_MAP[t])
    .map((t) => `- ${t} → ${TOOL_NAME_MAP[t]}`);

  if (mappedTools.length === 0) return '';

  return `\n\n## MCP Tool-Zuordnung\nDie im Systemprompt genannten internen Tool-Namen entsprechen folgenden MCP-Tools:\n${mappedTools.join('\n')}`;
}

interface PromptMessage {
  role: 'user' | 'assistant';
  content: { type: 'text'; text: string };
}

function buildPromptMessages(
  agent: McpAgentDefinition,
  message: string,
  platformPrefix?: string
): PromptMessage[] {
  const messages: PromptMessage[] = [];

  // 1. System context as first user message (MCP only supports user/assistant)
  const toolHints = getMcpToolHints(agent.enabledTools);
  messages.push({
    role: 'user',
    content: {
      type: 'text',
      text: `# Systemprompt: ${agent.title}\n\n${agent.systemRole}${toolHints}\n\n---\n*Bitte antworte ab jetzt im Charakter dieses Assistenten.*`,
    },
  });

  // 2. Assistant opening message
  messages.push({
    role: 'assistant',
    content: { type: 'text', text: agent.openingMessage },
  });

  // 3. Few-shot example pairs
  if (agent.fewShotExamples) {
    for (const example of agent.fewShotExamples) {
      messages.push({
        role: 'user',
        content: { type: 'text', text: example.input },
      });
      messages.push({
        role: 'assistant',
        content: { type: 'text', text: example.output },
      });
    }
  }

  // 4. Actual user message (with optional platform prefix)
  const userText = platformPrefix ? `${platformPrefix} ${message}` : message;
  messages.push({
    role: 'user',
    content: { type: 'text', text: userText },
  });

  return messages;
}

function agentToPromptName(identifier: string): string {
  return identifier.replace('gruenerator-', '');
}

export function getPromptList(): Array<{
  name: string;
  title: string;
  description: string;
}> {
  return AGENTS.map((agent) => ({
    name: agentToPromptName(agent.identifier),
    title: agent.title,
    description: agent.description,
  }));
}

export function registerAgentPrompts(server: McpServer): void {
  for (const agent of AGENTS) {
    const promptName = agentToPromptName(agent.identifier);

    if (agent.identifier === 'gruenerator-oeffentlichkeitsarbeit') {
      // Special case: add platform enum argument
      const platformValues = SOCIAL_MEDIA_VARIANTS.map((v) => v.platform) as [string, ...string[]];

      server.registerPrompt(
        promptName,
        {
          title: agent.title,
          description: `${agent.description} Optionaler platform-Parameter: ${SOCIAL_MEDIA_VARIANTS.map((v) => v.title).join(', ')}.`,
          argsSchema: {
            message: z
              .string()
              .describe('Deine Anfrage an den Assistenten (Thema, Inhalt, Anweisungen)'),
            platform: z
              .enum(platformValues)
              .optional()
              .describe(
                `Zielplattform: ${SOCIAL_MEDIA_VARIANTS.map((v) => `${v.platform} (${v.title})`).join(', ')}`
              ),
          },
        },
        ({ message, platform }) => {
          const variant = platform
            ? SOCIAL_MEDIA_VARIANTS.find((v) => v.platform === platform)
            : undefined;

          return {
            description: variant ? `${agent.title} — ${variant.title}` : agent.description,
            messages: buildPromptMessages(agent, message, variant?.contextPrefix),
          };
        }
      );
    } else {
      // Standard agent: message-only argument
      server.registerPrompt(
        promptName,
        {
          title: agent.title,
          description: agent.description,
          argsSchema: {
            message: z
              .string()
              .describe('Deine Anfrage an den Assistenten (Thema, Inhalt, Anweisungen)'),
          },
        },
        ({ message }) => ({
          description: agent.description,
          messages: buildPromptMessages(agent, message),
        })
      );
    }
  }
}
