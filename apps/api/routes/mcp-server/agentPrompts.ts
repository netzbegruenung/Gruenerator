/**
 * Die Grünerator-Agenten als MCP-Prompts.
 *
 * Ein Prompt ist reiner Text und gibt nichts frei — deshalb hängen sie an
 * keinem Scope, genauso wie `recherche` und `notizbuch-antwort`.
 *
 * Gegenüber dem alten Server entfällt der Codegen: der las
 * `packages/shared/src/agents/mcpProjection.ts` und schrieb eine 167-KB-Datei
 * nach `services/mcp/src/prompts/agents.generated.ts`, weil jenes Paket ohne
 * Abhängigkeit auf `@gruenerator/shared` bauen sollte. `apps/api` hängt ohnehin
 * daran, also wird hier direkt die Projektion gelesen.
 *
 * Die Prompt-Namen sind F0 — ein Client, der `wahlprogramm` in seiner
 * Konfiguration stehen hat, kennt den Agenten unter keinem anderen.
 */
import { MCP_AGENTS, MCP_SOCIAL_MEDIA_VARIANTS, type McpAgent } from '@gruenerator/shared/agents';
import { z } from 'zod';

import { localizePlaceholders } from '../../services/localization/index.js';

import type { PromptMessage } from './methodPrompts.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * Die Systemprompts nennen interne Werkzeugnamen. Ein MCP-Client sieht andere —
 * ohne diese Zuordnung sucht das Modell nach einem Werkzeug namens `search`.
 */
const TOOL_NAME_MAP: Record<string, string> = {
  search: 'gruenerator_search',
  search_documents: 'gruenerator_search',
  web: '(Websuche — kein MCP-Werkzeug, der Client bringt sie selbst mit)',
  web_search: '(Websuche — kein MCP-Werkzeug, der Client bringt sie selbst mit)',
  examples: 'gruenerator_examples_search',
  search_examples: 'gruenerator_examples_search',
};

const LOCALE_BY_COUNTRY = { DE: 'de-DE', AT: 'de-AT' } as const;
type Country = keyof typeof LOCALE_BY_COUNTRY;

function toolHints(enabledTools?: readonly string[]): string {
  const mapped = (enabledTools ?? [])
    .filter((t) => TOOL_NAME_MAP[t])
    .map((t) => `- ${t} → ${TOOL_NAME_MAP[t]}`);
  if (mapped.length === 0) return '';
  return `\n\n## MCP-Werkzeuge\nDie im Systemprompt genannten internen Werkzeugnamen entsprechen diesen MCP-Werkzeugen:\n${mapped.join('\n')}`;
}

function buildAgentMessages(agent: McpAgent, message: string, country: Country): PromptMessage[] {
  const locale = LOCALE_BY_COUNTRY[country];
  const localize = (text: string) => localizePlaceholders(text, locale);

  const messages: PromptMessage[] = [
    {
      // MCP kennt nur user/assistant — der Systemprompt reist als erste
      // Nutzernachricht mit.
      role: 'user',
      content: {
        type: 'text',
        text: `# Systemprompt: ${agent.title}\n\n${localize(agent.systemRole)}${toolHints(agent.enabledTools)}\n\n---\n*Bitte antworte ab jetzt im Charakter dieses Assistenten.*`,
      },
    },
    { role: 'assistant', content: { type: 'text', text: localize(agent.openingMessage) } },
  ];

  for (const example of agent.fewShotExamples ?? []) {
    messages.push({ role: 'user', content: { type: 'text', text: example.input } });
    messages.push({ role: 'assistant', content: { type: 'text', text: localize(example.output) } });
  }

  messages.push({ role: 'user', content: { type: 'text', text: message } });
  return messages;
}

/** `gruenerator-wahlprogramm` → `wahlprogramm`. */
export function agentToPromptName(identifier: string): string {
  return identifier.replace('gruenerator-', '');
}

const OEFFENTLICHKEITSARBEIT = 'gruenerator-oeffentlichkeitsarbeit';

const COUNTRY_ARG = z.enum(['DE', 'AT']).describe('Land: DE = Deutschland, AT = Österreich');
const MESSAGE_ARG = z
  .string()
  .describe('Deine Anfrage an den Assistenten (Thema, Inhalt, Anweisungen)');

export function registerAgentPrompts(server: McpServer): void {
  for (const agent of MCP_AGENTS) {
    const name = agentToPromptName(agent.identifier);

    // Der Öffentlichkeitsarbeits-Agent trägt als einziger Plattform-Varianten
    // (Pressemitteilung, Instagram, …) und bekommt sie als eigenes Argument.
    if (agent.identifier === OEFFENTLICHKEITSARBEIT && MCP_SOCIAL_MEDIA_VARIANTS.length > 0) {
      const platforms = MCP_SOCIAL_MEDIA_VARIANTS.map((v) => v.platform) as [string, ...string[]];
      server.registerPrompt(
        name,
        {
          title: agent.title,
          description: `${agent.description} Optionaler platform-Parameter: ${MCP_SOCIAL_MEDIA_VARIANTS.map((v) => v.title).join(', ')}.`,
          argsSchema: {
            message: MESSAGE_ARG,
            country: COUNTRY_ARG,
            platform: z
              .enum(platforms)
              .optional()
              .describe(
                `Zielplattform: ${MCP_SOCIAL_MEDIA_VARIANTS.map((v) => `${v.platform} (${v.title})`).join(', ')}`
              ),
          },
        },
        ({ message, country, platform }) => {
          const variant = MCP_SOCIAL_MEDIA_VARIANTS.find((v) => v.platform === platform);
          return {
            description: variant ? `${agent.title} — ${variant.title}` : agent.description,
            messages: buildAgentMessages(agent, message, country as Country),
          };
        }
      );
      continue;
    }

    server.registerPrompt(
      name,
      {
        title: agent.title,
        description: agent.description,
        argsSchema: { message: MESSAGE_ARG, country: COUNTRY_ARG },
      },
      ({ message, country }) => ({
        description: agent.description,
        messages: buildAgentMessages(agent, message, country as Country),
      })
    );
  }
}
