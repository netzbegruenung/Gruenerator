/**
 * Was der Werkzeugkatalog pro Modellaufruf kostet — je Werkzeug und je Turn-Form.
 *
 * Gemessen wird, was der Provider TATSÄCHLICH sieht: Name, Beschreibung und das
 * aus `inputSchema` erzeugte JSON-Schema (`asSchema`, derselbe Weg, den das AI
 * SDK vor dem Request geht). Nicht die Quelldatei, nicht die Zod-Definition.
 * Die Schätzung (Zeichen / 3,5) lag gegen echte `prompt_tokens` 4 % zu niedrig —
 * der Live-Abgleich steht in `measureCatalogPromptTokens.ts`.
 *
 * Die Werkzeugtabelle ist die Vereinigung über alle Turn-Formen unten: viele
 * Werkzeuge hängen an Zustand (Anhang, Gedächtnis, Verbund-Art, Vokabular) und
 * erscheinen nur in einer davon. MCP-Werkzeuge und `rezept_laden` fehlen — ihre
 * Beschreibungen kommen aus Nutzerdaten bzw. der DB.
 *
 *   pnpm --filter @gruenerator/api exec tsx scripts/measureToolCatalog.ts [--json]
 */
import { asSchema } from '@ai-sdk/provider-utils';

import { makeAskHumanTool } from '../routes/chat/agents/askHumanTool.js';
import { buildChatToolCatalog } from '../routes/chat/agents/toolCatalog.js';
import { createSourceRegistry } from '../routes/chat/services/agenticLoop/sourceRegistry.js';

import type { AgentConfig } from '../routes/chat/agents/types.js';
import type { SSEWriter } from '../routes/chat/services/sseHelpers.js';
import type { ChatGraphState } from '../agents/langgraph/ChatGraph/types.js';
import type { ToolSet } from 'ai';

/** Nichts davon wird aufgerufen — die Werkzeuge werden gebaut, nicht ausgeführt. */
const sse = new Proxy({}, { get: () => () => undefined }) as unknown as SSEWriter;
const agentConfig = {
  identifier: 'gruenerator-universal',
  userId: 'measure-user',
} as unknown as AgentConfig;
const req = { user: { id: 'measure-user' } } as never;

const CHARS_PER_TOKEN = 3.5;

function charsOf(tools: ToolSet, name: string): number {
  const def = tools[name] as { description?: string; inputSchema?: unknown } | undefined;
  if (!def) return 0;
  let schema = '';
  try {
    schema = JSON.stringify(asSchema(def.inputSchema as never).jsonSchema);
  } catch {
    schema = '';
  }
  // 60 Zeichen für den JSON-Umschlag der Funktionsdefinition.
  return name.length + (def.description ?? '').length + schema.length + 60;
}

const tokens = (chars: number): number => Math.round(chars / CHARS_PER_TOKEN);

interface Turn {
  label: string;
  over: Record<string, unknown>;
}

const TURNS: Turn[] = [
  {
    label: 'Recherche DE — "Was steht im Wahlprogramm zu Windkraft?"',
    over: { lastUserTextNoMentions: 'Was steht im Wahlprogramm zu Windkraft?' },
  },
  {
    label: 'Recherche AT — dieselbe Frage, de-AT',
    over: {
      userLocale: 'de-AT',
      lastUserTextNoMentions: 'Was steht im Wahlprogramm zu Windkraft?',
    },
  },
  {
    label: 'Maximal — Anhang, PDF-Formular, Gedächtnis, Wolke, Agentura-Vokabular',
    over: {
      lastUserTextNoMentions:
        'Erinnere mich jeden Montag an meine Rezepte und meine Agenten, erstelle ein Bild',
      memoryEnabled: true,
      cloudConnectionCount: 1,
      documentSources: [{ kind: 'document', label: 'antrag.pdf', id: 'd1' }],
      pdfFormAttachments: [{ name: 'formular.pdf', data: '' }],
      intent: 'image',
    },
  },
  ...(['sharepic', 'presentation', 'sheet', 'document', 'board', 'pdf'] as const).map((kind) => ({
    label: `Verbund — ${kind}`,
    over: {
      lastUserTextNoMentions: `Erstelle ${kind}`,
      compoundGeneration: true,
      compoundGenerationKind: kind,
    },
  })),
];

function build(over: Record<string, unknown>): ToolSet {
  const state = {
    userLocale: 'de-DE',
    intent: 'agentic',
    messages: [],
    lastUserTextNoMentions: '',
    agentConfig,
    ...over,
  } as unknown as ChatGraphState;
  const { tools } = buildChatToolCatalog({
    agentConfig,
    sourceRegistry: createSourceRegistry(),
    loop: { sse, state, req, threadId: 't1' },
  });
  tools.ask_human = makeAskHumanTool();
  return tools;
}

const perTool = new Map<string, number>();
const turnTotals: Array<{ label: string; count: number; tokens: number }> = [];
for (const turn of TURNS) {
  const tools = build(turn.over);
  let chars = 0;
  for (const name of Object.keys(tools)) {
    const c = charsOf(tools, name);
    chars += c;
    perTool.set(name, Math.max(perTool.get(name) ?? 0, c));
  }
  turnTotals.push({ label: turn.label, count: Object.keys(tools).length, tokens: tokens(chars) });
}

const rows = [...perTool.entries()]
  .map(([name, chars]) => ({ name, chars, tokens: tokens(chars) }))
  .sort((a, b) => b.tokens - a.tokens);
const total = rows.reduce((s, r) => s + r.tokens, 0);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ rows, turnTotals, total }));
} else {
  console.log('| Werkzeug | Zeichen | ~Tokens |');
  console.log('|---|---:|---:|');
  for (const r of rows) console.log(`| ${r.name} | ${r.chars} | ${r.tokens} |`);
  console.log(`| **Summe (${rows.length} Werkzeuge)** | | **${total}** |`);
  console.log('\n| Turn-Form | Werkzeuge | ~Tokens |');
  console.log('|---|---:|---:|');
  for (const t of turnTotals) console.log(`| ${t.label} | ${t.count} | ${t.tokens} |`);
}

// Sauberer Ausstieg: die importierten Dienste halten offene Verbindungen (Redis,
// Better Auth), die den Prozess sonst mit einem Fehler beenden statt mit Erfolg.
process.exit(0);
