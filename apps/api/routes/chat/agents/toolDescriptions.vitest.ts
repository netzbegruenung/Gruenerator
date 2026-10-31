import { asSchema } from '@ai-sdk/provider-utils';
import { ALL_CHAT_INTENTS } from '@gruenerator/shared/chat-intents';
import { describe, expect, it, vi } from 'vitest';

import { buildProductKnowledgeBlock } from '../../../services/chat/productKnowledge.js';
import { createSourceRegistry } from '../services/agenticLoop/sourceRegistry.js';

import { makeAskHumanTool } from './askHumanTool.js';
import { buildChatToolCatalog } from './toolCatalog.js';

import type { AgentConfig } from './types.js';
import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { SSEWriter } from '../services/sseHelpers.js';
import type { ToolSet } from 'ai';

/**
 * Was die Werkzeugbeschreibungen dem Modell über ANDERE Werkzeuge sagen.
 *
 * Eine Beschreibung, die auf ein Werkzeug verweist, das es nicht gibt, schickt
 * den Planer ins Leere; eine Grenze, die nur eine Seite kennt, lässt die andere
 * Seite den Fall weiter beanspruchen. Beides sieht kein Typcheck, weil es
 * Prosa ist. Gebaut wird der ECHTE Katalog, ohne Attrappen der Werkzeuge —
 * geprüft wird der Text, den der Provider bekommt.
 */

vi.mock('../../../services/agents/AdminHiddenAgentsService.js', () => ({
  getHiddenAgentIdentifiersCached: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../../services/mcp/McpServerRegistry.js', () => ({
  McpServerRegistry: { list: vi.fn().mockResolvedValue([]) },
}));

const LOCALES = ['de-DE', 'de-AT'] as const;

/**
 * Werkzeuge, die die Schleife außerhalb von `buildChatToolCatalog` montiert
 * oder die nur unter einer Bedingung entstehen, die dieser Test nicht nachbaut.
 * Jeder Eintrag nennt die Datei, die ihn baut.
 */
const MOUNTED_ELSEWHERE = new Set([
  // recipeTools.ts — nur mit geladenem Rezeptkatalog
  'rezept_laden',
  // vorlagenTools.ts — nur auf Zuruf oder unter einem Social-Rezept
  'vorlagen_vorschlagen',
]);

/**
 * Paare, deren Zuständigkeit sich überschneidet: jede Seite nennt die andere
 * beim Namen. Wächst mit jedem Paar, bei dem das Modell nachweislich daneben
 * greift (Werkzeugwahl-Eval, `evals/corpus/werkzeugwahl.jsonl`).
 */
const BOUNDARY_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['gruenerator_search', 'web_search'],
  ['product_knowledge', 'gruenerator_docs_search'],
  ['documents', 'read_artifact'],
  ['find_content', 'read_artifact'],
  ['find_content', 'media'],
  ['find_content', 'search_threads'],
  ['expand_attachment', 'dokumente_lesen'],
  ['gruenerator_examples_search', 'gruenerator_pressemitteilung_examples'],
  ['bundestag', 'bundestag_reden'],
  ['bundestag', 'abgeordnetenwatch'],
  ['bundestag_reden', 'parlament_lesen'],
  ['notebooks', 'notebook_quellen'],
];

/** Begriffe, die in modellseitigen Texten nichts mehr verloren haben (CLAUDE.md, Sprachregelungen). */
const RETIRED_TERMS = [/Agentura/];

const sse = new Proxy({}, { get: () => () => undefined }) as unknown as SSEWriter;
const agentConfig = { identifier: 'gruenerator-universal', userId: 'u1' } as unknown as AgentConfig;

/** Ein Turn, der möglichst viele zustandsabhängige Werkzeuge montiert. */
function buildCatalog(userLocale: (typeof LOCALES)[number]): ToolSet {
  const state = {
    userLocale,
    intent: 'agentic',
    messages: [],
    agentConfig,
    lastUserTextNoMentions:
      'Erinnere mich jeden Montag an meine Rezepte und meine Agenten, erstelle ein Bild',
    memoryEnabled: true,
    cloudConnectionCount: 1,
    documentSources: [{ kind: 'document', label: 'antrag.pdf', id: 'd1' }],
    pdfFormAttachments: [{ name: 'formular.pdf', data: '' }],
  } as unknown as ChatGraphState;
  const { tools } = buildChatToolCatalog({
    agentConfig,
    sourceRegistry: createSourceRegistry(),
    loop: { sse, state, req: { user: { id: 'u1' } } as never, threadId: 't1' },
  });
  tools.ask_human = makeAskHumanTool();
  return tools;
}

const catalogs = Object.fromEntries(LOCALES.map((l) => [l, buildCatalog(l)])) as Record<
  (typeof LOCALES)[number],
  ToolSet
>;

const descriptionOf = (tools: ToolSet, name: string): string =>
  (tools[name] as { description?: string }).description ?? '';

/** Eigenschaftsnamen und Enum-Werte eines Schemas — die Aktionen und Felder, die eine Beschreibung nennen darf. */
function schemaIdentifiers(node: unknown, into: Set<string>): void {
  if (Array.isArray(node)) {
    for (const n of node) schemaIdentifiers(n, into);
    return;
  }
  if (!node || typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  if (obj.properties && typeof obj.properties === 'object') {
    for (const key of Object.keys(obj.properties)) into.add(key);
  }
  for (const v of [...(Array.isArray(obj.enum) ? obj.enum : []), obj.const]) {
    if (typeof v === 'string') into.add(v);
  }
  for (const child of Object.values(obj)) schemaIdentifiers(child, into);
}

const toolNames = new Set([
  ...LOCALES.flatMap((l) => Object.keys(catalogs[l])),
  ...MOUNTED_ELSEWHERE,
]);
const knownIdentifiers = new Set(toolNames);
for (const l of LOCALES) {
  for (const def of Object.values(catalogs[l])) {
    schemaIdentifiers(
      asSchema((def as { inputSchema: unknown }).inputSchema as never).jsonSchema,
      knownIdentifiers
    );
  }
}

/** snake_case-Wörter — so heißen Werkzeuge und Aktionen, kaum je ein deutsches Wort. */
const IDENTIFIER_RE = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g;

describe('tool descriptions', () => {
  it.each(LOCALES)('name only tools and actions that exist (%s)', (locale) => {
    const dangling = Object.keys(catalogs[locale]).flatMap((name) =>
      [...descriptionOf(catalogs[locale], name).matchAll(IDENTIFIER_RE)]
        .map((m) => m[0])
        .filter((id) => !knownIdentifiers.has(id))
        .map((id) => `${name} → ${id}`)
    );
    expect(dangling).toEqual([]);
  });

  it('give every retrieval intent loop tools that a backend mounts', () => {
    const dangling = ALL_CHAT_INTENTS.flatMap((intent) =>
      'loopTools' in intent
        ? (intent.loopTools ?? [])
            .filter((t) => !toolNames.has(t))
            .map((t) => `${intent.id} → ${t}`)
        : []
    );
    expect(dangling).toEqual([]);
  });

  it.each(LOCALES)('draw overlapping boundaries from both sides (%s)', (locale) => {
    const tools = catalogs[locale];
    const oneSided = BOUNDARY_PAIRS.flatMap(([a, b]) => {
      if (!tools[a] || !tools[b]) return [];
      return [
        ...(descriptionOf(tools, a).includes(b) ? [] : [`${a} nennt ${b} nicht`]),
        ...(descriptionOf(tools, b).includes(a) ? [] : [`${b} nennt ${a} nicht`]),
      ];
    });
    expect(oneSided).toEqual([]);
  });

  it('every boundary pair is mounted together in at least one locale', () => {
    // Sonst prüft ein umbenanntes Werkzeug sein Paar still nie wieder.
    const unmounted = BOUNDARY_PAIRS.filter(([a, b]) =>
      LOCALES.every((l) => !catalogs[l][a] || !catalogs[l][b])
    );
    expect(unmounted).toEqual([]);
  });

  it.each(LOCALES)('use no retired product names (%s)', async (locale) => {
    // Das Schema zählt mit: Feldbeschreibungen gehen genauso an den Provider.
    const texts = [
      ...Object.entries(catalogs[locale]).map(([n, def]) => [
        n,
        `${descriptionOf(catalogs[locale], n)}\n${JSON.stringify(
          asSchema((def as { inputSchema: unknown }).inputSchema as never).jsonSchema
        )}`,
      ]),
      [
        'product_knowledge block',
        await buildProductKnowledgeBlock({ locale, userId: null, question: 'was kannst du?' }),
      ],
    ];
    const hits = texts.flatMap(([where, text]) =>
      RETIRED_TERMS.filter((re) => re.test(text!)).map((re) => `${where}: ${re.source}`)
    );
    expect(hits).toEqual([]);
  });
});
