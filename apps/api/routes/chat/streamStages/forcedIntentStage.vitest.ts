/**
 * Was eine @-Erwähnung mit dem Intent macht — und in welcher REIHENFOLGE.
 *
 * Die Reihenfolge ist der Grund für diese Datei. Das Rück-Mapping stand als
 * Kette gleichförmiger if-Blöcke; jeder Treffer überschrieb den vorherigen, und
 * die eine Ausnahme (`SIMPLE_FORCED_INTENTS` mit `break`) war ein
 * Schleifen-Detail. Beim Umbau auf eine Tabelle ist genau das die Eigenschaft,
 * die still hätte kippen können — ein Test dafür gab es nicht.
 */
import { describe, expect, it } from 'vitest';

import { runForcedIntentStage, type ForcedIntentStageParams } from './forcedIntentStage.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';

/** Nur die Felder, die die Stage liest oder schreibt. */
function makeState(overrides: Partial<ChatGraphState> = {}): ChatGraphState {
  return { intent: 'direct', messages: [], ...overrides } as unknown as ChatGraphState;
}

function run(
  forcedTools: string[],
  opts: { userLocale?: string; state?: Partial<ChatGraphState> } = {}
): Promise<{ state: ChatGraphState; forcedTool: boolean }> {
  const classifiedState = makeState(opts.state);
  const params = {
    // isCompound bleibt false (keine Notizbücher), also sendet die Stage nichts.
    sse: { send: () => undefined },
    classifiedState,
    initialState: { userLocale: opts.userLocale ?? 'de-DE' },
    notebookIds: [],
    agentId: null,
    forcedTools,
    lastUserTextNoMentions: 'Wie ist die Lage?',
    lastUserMessage: { role: 'user', content: 'Wie ist die Lage?' },
    imageAttachments: [],
    // Ohne Thread-Id läuft die Bild-Rehydrierung nicht an — sie ist eine andere
    // Frage und braucht Dateisystem und Persistenz.
    actualThreadId: undefined,
  } as unknown as ForcedIntentStageParams;
  return runForcedIntentStage(params).then((r) => ({
    state: classifiedState,
    forcedTool: r.forcedTool,
  }));
}

describe('eine einzelne Erwähnung zurrt ihren Intent fest', () => {
  it.each([
    ['abgeordnetenwatch', 'abgeordnetenwatch'],
    ['bundestag', 'bundestag'],
    ['hilfe', 'hilfe'],
    ['umfragen', 'umfragen'],
    ['examples', 'examples'],
    ['pressemitteilung_examples', 'pressemitteilung_examples'],
    ['chat_history', 'chat_history'],
    ['social_post', 'social_post'],
    ['chart', 'chart'],
    ['compute', 'compute'],
  ])('@%s → %s', async (token, intent) => {
    const { state, forcedTool } = await run([token]);
    expect(state.intent).toBe(intent);
    expect(forcedTool).toBe(true);
  });

  it('trägt die Suchanfrage nach, wenn der Klassifikator keine gesetzt hat', async () => {
    const { state } = await run(['hilfe']);
    expect(state.searchQuery).toBe('Wie ist die Lage?');
  });

  it('lässt eine vorhandene Suchanfrage in Ruhe', async () => {
    const { state } = await run(['hilfe'], { state: { searchQuery: 'Sharepics erstellen' } });
    expect(state.searchQuery).toBe('Sharepics erstellen');
  });

  // `intent` allein sagt nicht, dass jemand GEWÄHLT hat — ein Verdikt des
  // Klassifikators sieht dort genauso aus. Der Loop braucht den Unterschied,
  // um seinen ersten Werkzeugaufruf beim Namen nennen zu dürfen.
  it('hält fest, dass eine Erwähnung den Intent gesetzt hat', async () => {
    const { state } = await run(['umfragen']);
    expect(state.mentionPinnedIntent).toBe('umfragen');
  });

  it('setzt die Markierung nicht ohne Erwähnung', async () => {
    const { state } = await run([]);
    expect(state.mentionPinnedIntent).toBeUndefined();
  });

  it('die Markierung folgt dem letzten Treffer, nicht dem ersten', async () => {
    const { state } = await run(['bundestag', 'chart']);
    expect(state.mentionPinnedIntent).toBe('chart');
  });
});

describe('Reihenfolge bei mehreren Erwähnungen', () => {
  it('der LETZTE Treffer der Einzelzeilen gewinnt', async () => {
    const { state } = await run(['bundestag', 'hilfe']);
    expect(state.intent).toBe('hilfe');
  });

  it('die Reihenfolge steht in der Tabelle, nicht in der Nachricht', async () => {
    // Umgekehrt übergeben — das Ergebnis darf sich nicht ändern.
    const { state } = await run(['hilfe', 'bundestag']);
    expect(state.intent).toBe('hilfe');
  });

  it('innerhalb der exklusiven Gruppe gewinnt der ERSTE Treffer', async () => {
    const { state } = await run(['chart', 'examples']);
    expect(state.intent).toBe('examples');
  });

  it('die exklusive Gruppe schlägt eine vorher eingetragene Einzelzeile', async () => {
    const { state } = await run(['bundestag', 'chart']);
    expect(state.intent).toBe('chart');
  });

  it('ein Server-Scope überlebt, auch wenn eine spätere Zeile den Intent übernimmt', async () => {
    const { state } = await run(['mcp:notion', 'examples']);
    expect(state.intent).toBe('examples');
    expect(state.mcpServerScope).toBe('notion');
  });
});

describe('mcp-Zeile', () => {
  it('@<server> setzt Intent und Scope', async () => {
    const { state, forcedTool } = await run(['mcp:brevo']);
    expect(state.intent).toBe('mcp');
    expect(state.mcpServerScope).toBe('brevo');
    expect(forcedTool).toBe(true);
  });

  it('ein blankes mcp-Alttoken läuft ungescopet', async () => {
    const { state } = await run(['mcp']);
    expect(state.intent).toBe('mcp');
    expect(state.mcpServerScope).toBeNull();
  });

  it('trägt KEINE Suchanfrage nach — die Werkzeuge des Servers bekommen die Frage', async () => {
    const { state } = await run(['mcp:notion']);
    expect(state.searchQuery).toBeUndefined();
  });
});

describe('Locale-Gitter der beiden DE-only-Quellen', () => {
  it.each(['bundestag', 'abgeordnetenwatch'])(
    '@%s wird für de-AT ignoriert statt leere Daten abzurufen',
    async (token) => {
      const { state, forcedTool } = await run([token], {
        userLocale: 'de-AT',
        state: { intent: 'web' },
      });
      expect(state.intent).toBe('web');
      expect(forcedTool).toBe(false);
    }
  );

  it('@umfragen gilt auch in Österreich — PolitPro deckt den Nationalrat ab', async () => {
    const { state } = await run(['umfragen'], { userLocale: 'de-AT' });
    expect(state.intent).toBe('umfragen');
  });
});

describe('Zeilen, die die Tabelle NICHT trägt', () => {
  it('@bildbearbeiten läuft vor der Tabelle und setzt die Stil-Variante', async () => {
    const { state } = await run(['image_edit_universal']);
    expect(state.intent).toBe('image_edit');
    expect(state.imageEditStyle).toBe('universal');
  });

  it('@stadtbegruenen bleibt die gebrandete Variante', async () => {
    const { state } = await run(['image_edit']);
    expect(state.intent).toBe('image_edit');
    expect(state.imageEditStyle).toBe('green-edit');
  });

  it('@deepresearch läuft nach der Tabelle und ist eine research-Variante', async () => {
    const { state } = await run(['deepresearch']);
    expect(state.intent).toBe('research');
    expect(state.deepResearchRequested).toBe(true);
    expect(state.explicitDeepRequest).toBe(true);
  });

  it('@pdf-erstellen zurrt nichts fest — die Erstellroute nimmt den Turn', async () => {
    const { state, forcedTool } = await run(['pdf-erstellen']);
    expect(state.intent).toBe('direct');
    expect(forcedTool).toBe(false);
  });
});
