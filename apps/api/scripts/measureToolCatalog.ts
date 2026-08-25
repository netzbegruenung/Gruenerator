/**
 * Was der Werkzeugkatalog pro Modellaufruf kostet — vorher und nachher.
 *
 * Gemessen wird, was der Provider TATSÄCHLICH sieht: Name, Beschreibung und das
 * aus `inputSchema` erzeugte JSON-Schema (`asSchema`, derselbe Weg, den das AI
 * SDK vor dem Request geht). Nicht die Quelldatei, nicht die Zod-Definition.
 *
 * „Voll" ist der Katalog, wie er ohne `toolScope.ts` mitginge; „gezeigt" ist,
 * was nach dem Zurückstellen im Request landet. Die Schätzung hier (Zeichen /
 * 3,5) lag gegen echte `prompt_tokens` 4 % zu niedrig — der Live-Abgleich steht
 * in `measureCatalogPromptTokens.ts`.
 *
 *   pnpm --filter @gruenerator/api exec tsx scripts/measureToolCatalog.ts
 */
import { asSchema } from '@ai-sdk/provider-utils';

import { buildChatToolCatalog } from '../routes/chat/agents/toolCatalog.js';
import { createSourceRegistry } from '../routes/chat/services/agenticLoop/sourceRegistry.js';
import { createToolScope } from '../routes/chat/services/agenticLoop/toolScope.js';

import type { AgentConfig } from '../routes/chat/agents/types.js';
import type { SSEWriter } from '../routes/chat/services/sseHelpers.js';
import type { ChatGraphState } from '../agents/langgraph/ChatGraph/types.js';
import type { ToolSet } from 'ai';

/** Nichts davon wird aufgerufen — die Werkzeuge werden gebaut, nicht ausgeführt. */
const sse = new Proxy({}, { get: () => () => undefined }) as unknown as SSEWriter;
const agentConfig = { identifier: 'gruenerator-universal' } as unknown as AgentConfig;

function stateFor(over: Record<string, unknown>): ChatGraphState {
  return {
    userLocale: 'de-DE',
    intent: 'agentic',
    messages: [],
    lastUserTextNoMentions: '',
    ...over,
  } as unknown as ChatGraphState;
}

const CHARS_PER_TOKEN = 3.5;

function tokensOf(tools: ToolSet, name: string): number {
  const def = tools[name] as { description?: string; inputSchema?: unknown } | undefined;
  if (!def) return 0;
  let schema = '';
  try {
    schema = JSON.stringify(asSchema(def.inputSchema as never).jsonSchema);
  } catch {
    schema = '';
  }
  // 60 Zeichen für den JSON-Umschlag der Funktionsdefinition.
  const chars = name.length + (def.description ?? '').length + schema.length + 60;
  return Math.round(chars / CHARS_PER_TOKEN);
}

const sum = (tools: ToolSet, names: readonly string[]): number =>
  names.reduce((s, n) => s + tokensOf(tools, n), 0);

const TURNS = [
  {
    label: 'A  Recherche DE   "Was steht im Wahlprogramm zu Windkraft?"',
    over: { lastUserTextNoMentions: 'Was steht im Wahlprogramm zu Windkraft?' },
  },
  {
    label: 'B  Eigene Inhalte "Welche Aufgaben stehen auf meinem Board?"',
    over: { lastUserTextNoMentions: 'Welche Aufgaben stehen auf meinem Board?' },
  },
  {
    label: 'C  Erstellung DE  "Mach ein Sharepic zum Tempolimit"',
    over: {
      lastUserTextNoMentions: 'Mach ein Sharepic zum Tempolimit',
      compoundGeneration: true,
      compoundGenerationKind: 'sharepic',
    },
  },
  {
    label: 'D  Recherche AT   dieselbe Frage, userLocale de-AT',
    over: {
      userLocale: 'de-AT',
      lastUserTextNoMentions: 'Was steht im Wahlprogramm zu Windkraft?',
    },
  },
] as const;

for (const turn of TURNS) {
  const state = stateFor(turn.over);
  const { tools } = buildChatToolCatalog({
    agentConfig,
    sourceRegistry: createSourceRegistry(),
    loop: { sse, state, req: {} as never, threadId: 't1' },
  });

  const scope = createToolScope({
    toolNames: Object.keys(tools),
    userText: state.lastUserTextNoMentions ?? '',
  });
  Object.assign(tools, scope.loaderTools());

  const alle = Object.keys(tools).filter((n) => !n.endsWith('_laden') || n === 'rezept_laden');
  const gezeigt = scope.activeTools() ?? Object.keys(tools);

  const voll = sum(tools, alle);
  const nachher = sum(tools, gezeigt);
  const spar = voll - nachher;

  console.log(`\n${turn.label}`);
  console.log(
    `  voll    ${alle.length.toString().padStart(2)} Werkzeuge  ${voll.toLocaleString('de').padStart(6)} Tokens`
  );
  console.log(
    `  gezeigt ${gezeigt.length.toString().padStart(2)} Werkzeuge  ${nachher.toLocaleString('de').padStart(6)} Tokens` +
      (spar > 0
        ? `   −${spar.toLocaleString('de')} (${Math.round((spar / voll) * 100)} %)`
        : '   (nichts zurückgestellt)')
  );
  const zurueck = scope.deferredToolNames();
  if (zurueck.length > 0) console.log(`  zurückgestellt: ${zurueck.join(', ')}`);
}

// Sauberer Ausstieg: die importierten Dienste halten offene Verbindungen (Redis,
// Better Auth), die den Prozess sonst mit einem Fehler beenden statt mit Erfolg.
process.exit(0);
