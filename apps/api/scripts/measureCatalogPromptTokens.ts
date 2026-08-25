/**
 * Der Live-Abgleich zur Schätzung aus `measureToolCatalog.ts`: derselbe Turn
 * dreimal gegen einen echten Provider — ohne Werkzeuge, mit dem VOLLEN Katalog
 * und mit dem, was `toolScope.ts` davon zeigt — und die vom Provider selbst
 * gemeldeten `prompt_tokens`.
 *
 * Warum überhaupt: die Schätzung teilt Zeichen durch 3,5 und rät den
 * JSON-Umschlag. Der Provider zählt. Drei Aufrufe mit `maxOutputTokens: 1`.
 *
 *   MISTRAL_API_KEY=… pnpm --filter @gruenerator/api exec tsx \
 *     scripts/measureCatalogPromptTokens.ts
 */
import { generateText } from 'ai';

import { buildChatToolCatalog } from '../routes/chat/agents/toolCatalog.js';
import { createSourceRegistry } from '../routes/chat/services/agenticLoop/sourceRegistry.js';
import { createToolScope } from '../routes/chat/services/agenticLoop/toolScope.js';
import { getModel } from '../services/ai/providers.js';

import type { AgentConfig } from '../routes/chat/agents/types.js';
import type { SSEWriter } from '../routes/chat/services/sseHelpers.js';
import type { ChatGraphState } from '../agents/langgraph/ChatGraph/types.js';
import type { ToolSet } from 'ai';

const FRAGE = 'Was steht im Wahlprogramm zu Windkraft?';

const sse = new Proxy({}, { get: () => () => undefined }) as unknown as SSEWriter;
const agentConfig = { identifier: 'gruenerator-universal' } as unknown as AgentConfig;
const state = {
  userLocale: 'de-DE',
  intent: 'agentic',
  messages: [],
  lastUserTextNoMentions: FRAGE,
} as unknown as ChatGraphState;

const { tools } = buildChatToolCatalog({
  agentConfig,
  sourceRegistry: createSourceRegistry(),
  loop: { sse, state, req: {} as never, threadId: 't1' },
});
const scope = createToolScope({ toolNames: Object.keys(tools), userText: FRAGE });
Object.assign(tools, scope.loaderTools());

const gezeigt = scope.activeTools() ?? Object.keys(tools);
const pick = (names: readonly string[]): ToolSet =>
  Object.fromEntries(names.filter((n) => n in tools).map((n) => [n, tools[n]]));

// Die Basislinie ist der Katalog OHNE die Lader — sonst misst man gegen einen
// Zustand, den es ohne diese Änderung gar nicht gäbe, und die Ersparnis fällt
// um den Preis des Rückwegs zu gross aus.
const loaderNamen = new Set(Object.keys(scope.loaderTools()));
const vorher = pick(Object.keys(tools).filter((n) => !loaderNamen.has(n)));
const nurGezeigte = pick(gezeigt);

async function promptTokens(mounted: ToolSet | null, active?: readonly string[]): Promise<number> {
  const res = await generateText({
    model: getModel('mistral', 'mistral-medium-2604'),
    system: 'Du bist ein Assistent.',
    messages: [{ role: 'user', content: FRAGE }],
    maxOutputTokens: 1,
    ...(mounted ? { tools: mounted } : {}),
    ...(active ? { prepareStep: () => ({ activeTools: active as string[] }) } : {}),
  });
  return res.usage.inputTokens ?? 0;
}

const ohne = await promptTokens(null);
const voll = await promptTokens(vorher);
const nachher = await promptTokens(nurGezeigte);
// Der eigentliche Weg im Betrieb: der VOLLE Katalog ist montiert, und
// `prepareStep` schneidet ihn. Muss auf denselben Wert kommen wie die
// vorgefilterte Menge darüber — sonst wendet das SDK `activeTools` nicht vor dem
// Request an, und die ganze Ersparnis wäre eine Annahme.
const ueberPrepareStep = await promptTokens(tools, gezeigt);

const zeile = (label: string, n: number, basis: number): string =>
  `  ${label.padEnd(28)} ${n.toLocaleString('de').padStart(6)} prompt_tokens` +
  (basis ? `   Katalog: ${(n - ohne).toLocaleString('de')}` : '');

console.log(`\nTurn: ${FRAGE}`);
console.log(zeile('ohne Werkzeuge', ohne, 0));
console.log(zeile(`vorher (${Object.keys(vorher).length} Werkzeuge)`, voll, 1));
console.log(zeile(`nachher (${gezeigt.length} Werkzeuge, inkl. Lader)`, nachher, 1));
console.log(zeile('davon über prepareStep', ueberPrepareStep, 1));
console.log(
  `\n  ERSPARNIS pro Aufruf: ${(voll - nachher).toLocaleString('de')} Tokens ` +
    `(${Math.round(((voll - nachher) / (voll - ohne)) * 100)} % des Katalogs)`
);
console.log(
  ueberPrepareStep === nachher
    ? '  prepareStep schneidet VOR dem Request — bestätigt.'
    : `  WARNUNG: prepareStep liefert ${ueberPrepareStep}, vorgefiltert ${nachher} — activeTools greift nicht wie angenommen.`
);
process.exit(0);
