import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import { createToolLoopGuards } from './loopGuards.js';
import {
  CONNECTOR_CAPS,
  METADATA_SLACK,
  OWN_CAP_TOOLS,
  UNCAPPED_READ_BUDGET,
  UNCAPPED_READ_TOOLS,
  toolResultBudget,
} from './toolResultBudgets.js';
import { type ToolLabel } from './types.js';
import {
  DEFAULT_MAX_RESULT_CHARS,
  MAX_TOOL_RESULT_CHARS,
  wrapToolsForLoop,
  type WrapToolsContext,
} from './wrapTools.js';

import type { SSEWriter } from '../sseHelpers.js';
import type { ToolSet } from 'ai';

const labels = new Map<string, ToolLabel>([
  [
    'notion__search',
    {
      serverName: 'Notion',
      toolName: 'search',
      origin: { kind: 'mcp', serverId: 's1', remoteToolName: 'search' },
    },
  ],
  [
    'bahn__verbindung',
    {
      serverName: 'Bahn',
      toolName: 'verbindung',
      origin: { kind: 'managed', serverId: 'bahn', remoteToolName: 'verbindung' },
    },
  ],
]);

/** Absätze, damit der Schnitt eine Grenze findet — Länge exakt `n`. */
const prose = (n: number): string =>
  'Absatz zum Verkehr und zur Wärmewende in der Kommune.\n\n'.repeat(Math.ceil(n / 54)).slice(0, n);

function wrap(tools: ToolSet, overrides: Partial<WrapToolsContext> = {}): ToolSet {
  const sse = { send: () => undefined } as unknown as SSEWriter;
  return wrapToolsForLoop(tools, {
    sse,
    guards: createToolLoopGuards(),
    recordStep: () => undefined,
    perCallTimeoutMs: 1000,
    resultBudgetFor: (name) => toolResultBudget(name, labels),
    ...overrides,
  });
}

async function through(name: string, output: unknown, overrides?: Partial<WrapToolsContext>) {
  const tools = wrap({ [name]: { execute: async () => output } } as unknown as ToolSet, overrides);
  const exec = (
    tools[name] as { execute: (i: unknown, o: { toolCallId: string }) => Promise<unknown> }
  ).execute;
  return exec({}, { toolCallId: 'c1' }) as Promise<Record<string, unknown>>;
}

describe('Werkzeuge mit eigener Kappe kommen ganz an', () => {
  it('read_document: ein Dokument in voller Lesekappe', async () => {
    const inhalt = prose(OWN_CAP_TOOLS.read_document as number);
    const out = await through('read_document', { documentId: 'd1', inhalt });
    expect(out.inhalt).toBe(inhalt);
    expect(out._gekuerzt).toBeUndefined();
  });

  it('read_artifact: Auszug samt Marker, und `truncated` bleibt das, was das Werkzeug sagt', async () => {
    const content = `${prose(OWN_CAP_TOOLS.read_artifact as number)}\n…[gekürzt]`;
    const out = await through('read_artifact', {
      kind: 'doc',
      title: 'T',
      content,
      truncated: true,
    });
    expect(out.content).toBe(content);
    expect(out.truncated).toBe(true);
    expect(out._gekuerzt).toBeUndefined();
  });

  it.each(['mcp', 'managed'] as const)('%s-Konnektor: Ergebnis in voller Kappe', async (kind) => {
    const name = kind === 'mcp' ? 'notion__search' : 'bahn__verbindung';
    const content = prose(CONNECTOR_CAPS[kind]);
    const out = await through(name, { content });
    expect(out.content).toBe(content);
    expect(out._gekuerzt).toBeUndefined();
  });

  it.each(UNCAPPED_READ_TOOLS)(
    '%s: ein Ergebnis von 15.000 Zeichen kommt ganz an',
    async (name) => {
      const inhalt = prose(15_000);
      const out = await through(name, { id: 'x', inhalt });
      expect(out.inhalt).toBe(inhalt);
    }
  );

  it('verwalteter News-Konnektor: nummerierter Block plus Rohtext in einer Kappe, ganz', async () => {
    // So baut `managedMcpCatalog.postProcess` das Feld: Block zuerst, Rohtext füllt den Rest.
    const numbered = '[1] Titel <https://example.org> — ' + 'x'.repeat(3000);
    const content = `${numbered}\n\n${prose(CONNECTOR_CAPS.managed - numbered.length - 2)}`;
    expect(content.length).toBe(CONNECTOR_CAPS.managed);
    const out = await through('bahn__verbindung', { content });
    expect(out.content).toBe(content);
  });
});

describe('Standard und Obergrenze', () => {
  it('unbekanntes Werkzeug: Standard 6000, gezielt gekürzt statt auf 750', async () => {
    expect(toolResultBudget('web_search', labels)).toBeNull();
    const out = (await through('web_search', {
      resultCount: 1,
      title: 'Titel bleibt',
      inhalt: prose(20_000),
    })) as { title: string; inhalt: string; _gekuerzt: { feld: string; gesamtZeichen: number } };
    expect(out.title).toBe('Titel bleibt');
    expect(out._gekuerzt).toMatchObject({ feld: 'inhalt', gesamtZeichen: 20_000 });
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(DEFAULT_MAX_RESULT_CHARS);
    expect(out.inhalt.length).toBeGreaterThan(4500);
  });

  it('kein Budget der Tabelle liegt über der Obergrenze', () => {
    const budgets = [
      ...Object.keys(OWN_CAP_TOOLS),
      ...UNCAPPED_READ_TOOLS,
      'notion__search',
      'bahn__verbindung',
    ].map((name) => toolResultBudget(name, labels) as number);
    for (const b of budgets) {
      expect(b).toBeGreaterThan(DEFAULT_MAX_RESULT_CHARS);
      expect(b).toBeLessThanOrEqual(MAX_TOOL_RESULT_CHARS);
    }
    expect(UNCAPPED_READ_BUDGET).toBeLessThanOrEqual(MAX_TOOL_RESULT_CHARS);
    expect(toolResultBudget('read_document', labels)).toBe(
      (OWN_CAP_TOOLS.read_document as number) + METADATA_SLACK
    );
  });

  it('ein entgleistes Werkzeug mit riesigem Budget wird auf 30.000 gekürzt', async () => {
    const out = (await through(
      'runaway',
      { inhalt: prose(200_000) },
      { resultBudgetFor: () => 500_000, maxResultChars: 900_000 }
    )) as { inhalt: string; _gekuerzt: { gesamtZeichen: number } };
    expect(out._gekuerzt.gesamtZeichen).toBe(200_000);
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(MAX_TOOL_RESULT_CHARS);
    expect(out.inhalt.length).toBeGreaterThan(25_000);
  });
});

describe('Wächter: jede Kappe über 6000 steht in der Tabelle oder begründet daneben', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const apiRoot = path.resolve(here, '../../../..');
  const agentsDir = path.join(apiRoot, 'routes/chat/agents');
  const files = [
    ...readdirSync(agentsDir)
      .filter((f) => f.endsWith('.ts') && !/\.(vitest|test|live\.vitest|manual-test)\.ts$/.test(f))
      .map((f) => path.join(agentsDir, f)),
    path.join(apiRoot, 'services/mcp/UserMCPClient.ts'),
  ];

  /** Konstanten, die NICHT als Ganzes zum Modell gehen — mit Grund. */
  const NOT_A_RESULT_CAP: Readonly<Record<string, string>> = {
    IMAGE_SNIPPET_CHARS: 'Registry-Snippet → `sources` (ausgenommenes Feld)',
    CRAWL_SNIPPET_CHARS: 'Registry-Snippet → `sources` (ausgenommenes Feld)',
    CRAWL_DISTILL_TARGET_CHARS:
      'Zielgröße der Destillation einer Seite, geht als `sources`-Snippet',
    EXPAND_ATTACHMENT_SNIPPET_CHARS: 'Registry-Snippet → `sources` (ausgenommenes Feld)',
    RAW_RESULT_MAX_CHARS: 'Rohpuffer vor dem Formen; geformt wird auf MODEL_RESULT_MAX_CHARS',
    MAX_IMAGE_CHARS: 'Bilddaten-URL im sharepic_check, kein Text fürs Modell',
  };
  const tableSource = readFileSync(path.join(here, 'toolResultBudgets.ts'), 'utf8');

  const found = files.flatMap((file) =>
    [
      ...readFileSync(file, 'utf8').matchAll(
        /^(?:export )?const ([A-Z_0-9]*(?:CAP|CHARS)[A-Z_0-9]*)\s*=\s*([\d_]+);/gm
      ),
    ]
      .map((m) => ({
        name: m[1] as string,
        value: Number((m[2] as string).replace(/_/g, '')),
        file,
      }))
      .filter((c) => c.value > DEFAULT_MAX_RESULT_CHARS)
  );

  it('findet die bekannten Kappen (der Scan ist nicht leer gelaufen)', () => {
    const names = found.map((c) => c.name);
    for (const known of [
      'READ_CAP',
      'ARTIFACT_READ_CHARS',
      'MODEL_RESULT_MAX_CHARS',
      'MAX_TOOL_RESULT_CHARS',
    ]) {
      expect(names).toContain(known);
    }
  });

  it('jede Kappe über 6000 ist in der Tabelle importiert oder als Nicht-Kappe begründet', () => {
    const unaccounted = found
      .filter(
        (c) => !new RegExp(`\\b${c.name}\\b`).test(tableSource) && !(c.name in NOT_A_RESULT_CAP)
      )
      .map((c) => `${path.relative(apiRoot, c.file)}: ${c.name} = ${c.value}`);
    expect(unaccounted).toEqual([]);
  });

  it('die Liste der Nicht-Kappen hat keine toten Einträge', () => {
    const names = new Set(found.map((c) => c.name));
    expect(Object.keys(NOT_A_RESULT_CAP).filter((n) => !names.has(n))).toEqual([]);
  });
});
