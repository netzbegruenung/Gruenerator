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
    // isCompound bleibt false (keine Notebooks), also sendet die Stage nichts.
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
    // `@umfragen` ist die Ausnahme und steht deshalb unten mit eigenem Test:
    // sein Intent ist stillgelegt, der Token zeigt auf `agentic` + Werkzeug-Pin.
    ['examples', 'examples'],
    // `@pressemitteilungen` steht aus demselben Grund unten: stillgelegter
    // Intent, Token zeigt auf `agentic` + Werkzeug-Pin + Rezept.
    // `@social` steht aus demselben Grund unten: stillgelegter Intent, der
    // Token zeigt auf den Einzeldurchlauf.
    ['chat_history', 'chat_history'],
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
  it('hält das gewählte WERKZEUG fest, nicht bloss den Intent', async () => {
    const { state } = await run(['bundestag']);
    expect(state.mentionPinnedTool).toBe('bundestag');
  });

  it('setzt die Markierung nicht ohne Erwähnung', async () => {
    const { state } = await run([]);
    expect(state.mentionPinnedTool).toBeUndefined();
  });

  // Kein `pinsTool` in der Registry heisst „diese Erwähnung meint kein einzelnes
  // Werkzeug" — und weil bei mehreren Erwähnungen die letzte gewinnt, muss sie
  // den Pin der vorherigen auch LÖSCHEN.
  it('eine Erwähnung ohne eigenes Werkzeug löscht den vorherigen Pin', async () => {
    const { state } = await run(['bundestag', 'chart']);
    expect(state.intent).toBe('chart');
    expect(state.mentionPinnedTool).toBe(null);
  });
});

describe('@umfragen — Erwähnung ohne Intent', () => {
  // Der Intent ist stillgelegt (`availability: 'retired'`), der Draht-Token
  // bleibt: er steckt in ausgelieferten Composern und in jedem persistierten
  // `@[Umfragen](tool:umfragen)` alter Threads (F0).
  it('setzt `agentic` und zurrt das PolitPro-Werkzeug fest', async () => {
    const { state, forcedTool } = await run(['umfragen']);
    expect(state.intent).toBe('agentic');
    expect(state.mentionPinnedTool).toBe('umfragen');
    expect(forcedTool).toBe(true);
  });

  it('trägt die Suchanfrage nach wie vor der Stilllegung', async () => {
    const { state } = await run(['umfragen']);
    expect(state.searchQuery).toBe('Wie ist die Lage?');
  });

  // `@umfragen @recherche`: die Such-Familie überschreibt den Intent, also ist
  // der Werkzeug-Pin überholt. Vorher tat das die Prüfung `pinned !== intent`
  // in `pinnedFirstTool`; jetzt löscht der Überschreibende ausdrücklich.
  it('eine spätere Suchklassen-Erwähnung löscht den Pin', async () => {
    const { state } = await run(['umfragen', 'research']);
    expect(state.intent).toBe('research');
    expect(state.mentionPinnedTool).toBe(null);
  });

  it('@deepresearch ebenso', async () => {
    const { state } = await run(['umfragen', 'deepresearch']);
    expect(state.intent).toBe('research');
    expect(state.mentionPinnedTool).toBe(null);
  });
});

describe('@pressemitteilungen — Erwähnung ohne Intent, mit Rezept', () => {
  // Zweiter Fall derselben Bauform, mit dem Unterschied, um den es in Phase L
  // geht: die Erwähnung zurrt nicht nur ein WERKZEUG fest, sie lädt auch die
  // TEXTSORTE. Der stillgelegte Intent trug immer nur das Erste.
  it('setzt `agentic`, zurrt das PM-Werkzeug fest und lädt das Rezept', async () => {
    const { state, forcedTool } = await run(['pressemitteilung_examples']);
    expect(state.intent).toBe('agentic');
    expect(state.mentionPinnedTool).toBe('gruenerator_pressemitteilung_examples');
    expect(state.activeSkillMention).toBe('presse');
    expect(forcedTool).toBe(true);
  });

  // Der Unterschied zum Werkzeug-Pin, und er ist Absicht: `activeSkillMention`
  // kann aus der ausdrücklichen Rezeptwahl im Composer stammen. Eine Erwähnung
  // überschreibt sie nicht — wer `/instagram` gewählt hat und `@pm` tippt, will
  // die PM-Beispiele, nicht eine andere Textsorte.
  it('überschreibt eine schon gewählte Textform nicht', async () => {
    const { state } = await run(['pressemitteilung_examples'], {
      state: { activeSkillMention: 'instagram' },
    });
    expect(state.activeSkillMention).toBe('instagram');
    expect(state.mentionPinnedTool).toBe('gruenerator_pressemitteilung_examples');
  });

  // Und sie LÖSCHT es auch nicht, anders als der Werkzeug-Pin: `@pm @recherche`
  // nimmt den Pin zurück (die Such-Familie überschreibt den Intent), die
  // Textsorte bleibt stehen — die Person will immer noch eine PM, nur mit
  // Recherche darunter.
  it('eine spätere Erwähnung ohne Rezept löscht das Rezept nicht', async () => {
    const { state } = await run(['pressemitteilung_examples', 'research']);
    expect(state.intent).toBe('research');
    expect(state.mentionPinnedTool).toBe(null);
    expect(state.activeSkillMention).toBe('presse');
  });
});

describe('@social — Erwähnung weg, Token bleibt', () => {
  // Dritter Fall derselben Bauform, und der einzige ohne Ersatzziel: `@umfragen`
  // zeigt auf ein Werkzeug, `@pressemitteilungen` auf Werkzeug plus Rezept —
  // ein Social-Post hat kein Werkzeug, er ist eine Textsorte. Der Token landet
  // deshalb schlicht auf dem Einzeldurchlauf; welches Rezept ihn schreibt,
  // entscheidet `deriveImplicitRecipeMention` in routingStage aus dem Text.
  it('setzt `produktion` und zurrt kein Werkzeug fest', async () => {
    const { state, forcedTool } = await run(['social_post']);
    expect(state.intent).toBe('produktion');
    expect(state.mentionPinnedTool).toBe(null);
    expect(forcedTool).toBe(true);
  });

  it('lädt kein Rezept aus der Erwähnung — das tut der Text', async () => {
    const { state } = await run(['social_post']);
    expect(state.activeSkillMention ?? null).toBe(null);
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

  // Das Gitter fragt weiterhin die Zielgruppe der QUELLE (`localeIntent:
  // 'umfragen'`) und nicht die des ausführenden `agentic` — sonst wäre es für
  // jede stillgelegte Erwähnung still ein No-op.
  it('@umfragen gilt auch in Österreich — PolitPro deckt den Nationalrat ab', async () => {
    const { state } = await run(['umfragen'], { userLocale: 'de-AT' });
    expect(state.intent).toBe('agentic');
    expect(state.mentionPinnedTool).toBe('umfragen');
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

  it('@pdf-erstellen zurrt keinen INTENT fest — die Erstellroute nimmt den Turn', async () => {
    const { state, forcedTool } = await run(['pdf-erstellen']);
    expect(state.intent).toBe('direct');
    expect(forcedTool).toBe(false);
  });

  // M-Befund §5. Die fünf Erstell-Token stehen absichtlich nicht in der Tabelle
  // (`forcedTool` würde den Verbund auf die direkte Erstellroute zwingen), aber
  // die ART müssen sie sagen können — sonst leitet `turnPlan` sie neu aus dem
  // Substantiv im Text ab.
  describe('die Erstell-Erwähnungen zurren ihre ART fest', () => {
    const CASES = [
      ['board-erstellen', 'board'],
      ['sheet-erstellen', 'sheet'],
      ['praesentation-erstellen', 'presentation'],
      ['dokument-erstellen', 'document'],
      ['pdf-erstellen', 'pdf'],
    ] as const;

    for (const [token, kind] of CASES) {
      it(`@${token} → ${kind}`, async () => {
        const { state, forcedTool } = await run([token]);
        expect(state.mentionPinnedArtifactKind).toBe(kind);
        // Unverändert: die Art zu nennen ist kein Werkzeugzwang.
        expect(forcedTool).toBe(false);
      });
    }

    it('ohne Erstell-Erwähnung bleibt die Art offen', async () => {
      const { state } = await run(['bundestag']);
      expect(state.mentionPinnedArtifactKind ?? null).toBe(null);
    });

    it('bei mehreren gewinnt die letzte', async () => {
      const { state } = await run(['sheet-erstellen', 'board-erstellen']);
      expect(state.mentionPinnedArtifactKind).toBe('board');
    });
  });
});
