/**
 * Der Live-Abgleich zur Schätzung aus `measureToolCatalog.ts`: derselbe Turn
 * dreimal gegen einen echten Provider — ohne Werkzeuge, mit dem Katalog, den
 * eine gewöhnliche Recherchefrage montiert, und mit demselben Katalog ohne den
 * `$schema`-Schlüssel, den zod jedem JSON-Schema voranstellt — und die vom
 * Provider selbst gemeldeten `prompt_tokens`. Drei Aufrufe mit
 * `maxOutputTokens: 1`.
 *
 *   MISTRAL_API_KEY=… pnpm --filter @gruenerator/api exec tsx \
 *     scripts/measureCatalogPromptTokens.ts
 */
import { asSchema } from '@ai-sdk/provider-utils';
import { generateText, jsonSchema, tool, type ToolSet } from 'ai';

import { makeAskHumanTool } from '../routes/chat/agents/askHumanTool.js';
import { buildChatToolCatalog } from '../routes/chat/agents/toolCatalog.js';
import { createSourceRegistry } from '../routes/chat/services/agenticLoop/sourceRegistry.js';
import { getModel } from '../services/ai/providers.js';

import type { AgentConfig } from '../routes/chat/agents/types.js';
import type { SSEWriter } from '../routes/chat/services/sseHelpers.js';
import type { ChatGraphState } from '../agents/langgraph/ChatGraph/types.js';

const FRAGE = 'Was steht im Wahlprogramm zu Windkraft?';

const sse = new Proxy({}, { get: () => () => undefined }) as unknown as SSEWriter;
const agentConfig = {
  identifier: 'gruenerator-universal',
  userId: 'measure-user',
} as unknown as AgentConfig;
const state = {
  userLocale: 'de-DE',
  intent: 'agentic',
  messages: [],
  lastUserTextNoMentions: FRAGE,
  agentConfig,
} as unknown as ChatGraphState;

const { tools } = buildChatToolCatalog({
  agentConfig,
  sourceRegistry: createSourceRegistry(),
  loop: { sse, state, req: {} as never, threadId: 't1' },
});
tools.ask_human = makeAskHumanTool();

async function promptTokens(mounted: ToolSet | null): Promise<number> {
  const res = await generateText({
    model: getModel('mistral', 'mistral-medium-2604'),
    system: 'Du bist ein Assistent.',
    messages: [{ role: 'user', content: FRAGE }],
    maxOutputTokens: 1,
    ...(mounted ? { tools: mounted } : {}),
  });
  return res.usage.inputTokens ?? 0;
}

// Derselbe Katalog, nur ohne `$schema` — der Schlüssel trägt für das Modell
// nichts, geht aber mit jedem Werkzeug in den Prompt.
const ohneSchemaUri: ToolSet = {};
for (const [name, def] of Object.entries(tools)) {
  const { $schema: _uri, ...rest } = asSchema(def.inputSchema as never).jsonSchema as Record<
    string,
    unknown
  >;
  ohneSchemaUri[name] = tool({
    ...(def.description ? { description: def.description } : {}),
    inputSchema: jsonSchema(rest as never),
  });
}

const ohne = await promptTokens(null);
const mit = await promptTokens(tools);
const mitOhneUri = await promptTokens(ohneSchemaUri);

console.log(`\nTurn: ${FRAGE}`);
console.log(`  ohne Werkzeuge              ${ohne.toLocaleString('de').padStart(6)} prompt_tokens`);
console.log(
  `  mit Katalog (${Object.keys(tools).length} Werkzeuge)    ${mit.toLocaleString('de').padStart(6)} prompt_tokens` +
    `   Katalog: ${(mit - ohne).toLocaleString('de')}`
);
console.log(
  `  derselbe ohne $schema       ${mitOhneUri.toLocaleString('de').padStart(6)} prompt_tokens` +
    `   Katalog: ${(mitOhneUri - ohne).toLocaleString('de')}`
);
process.exit(0);
