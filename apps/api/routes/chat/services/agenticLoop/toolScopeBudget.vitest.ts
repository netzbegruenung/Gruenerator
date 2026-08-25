/**
 * Der Deckel, den `toolScope.ts` hält — an den ECHTEN Werkzeugen gemessen, nicht
 * an einer Attrappe.
 *
 * Zwei Dinge, die ohne diesen Wächter still verrotten:
 *
 * 1. **Die Gruppe verliert ein Werkzeug.** `DEFERRABLE_GROUPS` nennt Namen als
 *    Strings; wird eines umbenannt oder entfernt, stellt der Umfang es
 *    kommentarlos nicht mehr zurück und der Katalog wächst zurück auf den alten
 *    Stand — ohne dass irgendetwas rot wird.
 * 2. **Ein neues Werkzeug frisst die Ersparnis auf.** Der Katalog kostete am
 *    25.08.2026 gemessene 6.777 `prompt_tokens` (Mistral Medium 3.5, Turn
 *    "Was steht im Wahlprogramm zu Windkraft?"). Jedes neu montierte Werkzeug
 *    zahlt auf JEDEN werkzeugtragenden Aufruf ein. Der Deckel unten macht das
 *    zu einer Entscheidung im Diff statt zu einer Rechnung am Monatsende.
 *
 * Gemessen wird über `asSchema` — derselbe Weg, den das AI SDK vor dem Request
 * geht, also Name, Beschreibung und JSON-Schema. Die Zahl hier ist eine
 * Schätzung (Zeichen / 3,5); sie lag gegen die echten `prompt_tokens` 4 % zu
 * niedrig. Der Deckel ist entsprechend grosszügig gesetzt — er soll einen
 * Zuwachs fangen, nicht eine Umformulierung.
 */
import { asSchema } from '@ai-sdk/provider-utils';
import { describe, it, expect } from 'vitest';

import { buildChatToolCatalog } from '../../agents/toolCatalog.js';
import { createSourceRegistry } from './sourceRegistry.js';
import { createToolScope, DEFERRABLE_GROUPS } from './toolScope.js';

import type { AgentConfig } from '../../agents/types.js';
import type { SSEWriter } from '../sseHelpers.js';
import type { ChatGraphState } from '../../../../agents/langgraph/ChatGraph/types.js';
import type { ToolSet } from 'ai';

/** Nichts davon wird aufgerufen — die Werkzeuge werden gebaut, nicht ausgeführt. */
const sse = new Proxy({}, { get: () => () => undefined }) as unknown as SSEWriter;
const agentConfig = { identifier: 'gruenerator-universal' } as unknown as AgentConfig;

const RECHERCHE_TURN = 'Was steht im Wahlprogramm zu Windkraft?';

function buildFor(userText: string): ToolSet {
  const state = {
    userLocale: 'de-DE',
    intent: 'agentic',
    messages: [],
    lastUserTextNoMentions: userText,
  } as unknown as ChatGraphState;
  const { tools } = buildChatToolCatalog({
    agentConfig,
    sourceRegistry: createSourceRegistry(),
    loop: { sse, state, req: {} as never, threadId: 't1' },
  });
  return tools;
}

/** Was der Provider für diese Werkzeuge zu lesen bekommt, in Tokens. */
function tokensOf(tools: ToolSet, names: readonly string[]): number {
  let chars = 0;
  for (const name of names) {
    const def = tools[name] as { description?: string; inputSchema?: unknown } | undefined;
    if (!def) continue;
    let schema = '';
    try {
      schema = JSON.stringify(asSchema(def.inputSchema as never).jsonSchema);
    } catch {
      schema = '';
    }
    // 60 Zeichen für den JSON-Umschlag der Funktionsdefinition.
    chars += name.length + (def.description ?? '').length + schema.length + 60;
  }
  return Math.round(chars / 3.5);
}

describe('Werkzeugkatalog — Budget je Aufruf', () => {
  it('montiert jedes Werkzeug, das die zurückgestellte Gruppe nennt', () => {
    const tools = buildFor(RECHERCHE_TURN);
    for (const group of DEFERRABLE_GROUPS) {
      for (const name of group.tools) {
        // Schlägt fehl, sobald ein Werkzeug umbenannt oder ausgebaut wurde —
        // dann gehört der Name in `DEFERRABLE_GROUPS` mitgezogen.
        expect(Object.keys(tools)).toContain(name);
      }
    }
  });

  it('spart auf einem Recherche-Turn mindestens 2.000 Tokens', () => {
    const tools = buildFor(RECHERCHE_TURN);
    const scope = createToolScope({ toolNames: Object.keys(tools), userText: RECHERCHE_TURN });
    Object.assign(tools, scope.loaderTools());

    const alle = tokensOf(tools, Object.keys(tools));
    const active = scope.activeTools();
    expect(active).toBeDefined();
    const gezeigt = tokensOf(tools, active ?? []);

    expect(alle - gezeigt).toBeGreaterThanOrEqual(2_000);
  });

  it('hält den gezeigten Katalog eines Recherche-Turns unter 4.500 Tokens', () => {
    const tools = buildFor(RECHERCHE_TURN);
    const scope = createToolScope({ toolNames: Object.keys(tools), userText: RECHERCHE_TURN });
    Object.assign(tools, scope.loaderTools());

    // Gemessen nach dieser Änderung: ~3.900. Der Abstand ist Luft für eine
    // Umformulierung, nicht für ein weiteres Werkzeug.
    expect(tokensOf(tools, scope.activeTools() ?? [])).toBeLessThan(4_500);
  });

  it('kostet jeder Lader weniger als 250 Tokens', () => {
    const tools = buildFor(RECHERCHE_TURN);
    const loaders = createToolScope({
      toolNames: Object.keys(tools),
      userText: RECHERCHE_TURN,
    }).loaderTools();

    for (const group of DEFERRABLE_GROUPS) {
      // Der Rückweg muss auffindbar bleiben — deshalb kein knappes Label,
      // sondern eine Beschreibung, die sagt, wann er gemeint ist. Gemessen 188.
      expect(tokensOf(loaders, [group.loaderTool])).toBeLessThan(250);
    }
  });
});
