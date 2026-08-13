import { describe, it, expect, vi } from 'vitest';

import type { ChatGraphState } from '../types.js';

/**
 * Wer gibt die Form der Antwort vor — wir oder die*der Nutzer*in?
 *
 * `buildAnswerFormatRule` schreibt in JEDEN Turn eine Formatregel ins
 * Systemprompt, außer der Turn hat einen Eigentümer. Die Eigentümer waren bis
 * zum 13.08.2026 ausschließlich unsere eigenen Generatoren (`synthesisMode`,
 * vier Intents). Ein Format, das die*der Nutzer*in im Auftrag vorgibt, war
 * keiner — obwohl `detectTaskShape` es längst erkennt.
 *
 * Der gemessene Preis: Turn 3 des Laufs übergab eine gezeichnete Tabellen-
 * Kopfzeile, Turn 4 ein „erstelle ausschließlich"; beide liefen als `agentic`
 * und bekamen „2-4 Absätze mit klarer Struktur" befohlen — gegen den Vertrag in
 * der eigenen Nachricht.
 *
 * Geprüft wird am FERTIGEN Prompt, nicht am Renderer: die Regel ist eine von
 * ~30 Zeichenketten in einem Template, und was nicht in der Zeichenkette steht,
 * existiert für das Modell nicht.
 */

vi.mock('../../../../services/docs/docsIndex.js', () => ({ buildDocsPageMap: async () => '' }));
vi.mock('../../../../services/user/textFormRepository.js', () => ({
  getTextFormForInjection: async () => null,
}));

const { buildSystemMessage } = await import('./respondNode.js');

/** Der generische Satz, den ein Nutzer-Format verdrängen muss. */
const GENERIC = '2-4 Absätze mit klarer Struktur';
/** Der Satz, der auf den Auftrag zeigt statt auf eine Stelle im Prompt. */
const USER_OWNED = 'Form und Umfang gibt der Auftrag der*des Nutzer*in vor';

function state(overrides: Partial<ChatGraphState> = {}): ChatGraphState {
  return {
    intent: 'agentic',
    messages: [{ role: 'user', content: 'Ordne die Absätze einander zu.' }],
    searchResults: [],
    citations: [],
    agentConfig: { identifier: 'gruenerator-universal', systemRole: 'Du bist der Grünerator.' },
    enabledTools: {},
    generatedImage: null,
    imagePrompt: null,
    sharepicVariants: [],
    createdDocument: null,
    createdBoard: null,
    threadArtifacts: [],
    lastToolContext: null,
    ...overrides,
  } as unknown as ChatGraphState;
}

describe('Formatregel — der Auftrag der*des Nutzer*in ist ein Eigentümer', () => {
  it('ohne Formatvertrag steht die generische Regel im Prompt', async () => {
    const prompt = await buildSystemMessage(state());
    expect(prompt).toContain(GENERIC);
    expect(prompt).not.toContain(USER_OWNED);
  });

  it.each(['strict_format', 'code'] as const)(
    '%s verdrängt die generische Regel',
    async (shape) => {
      const prompt = await buildSystemMessage(state({ taskShape: shape }));
      expect(prompt).toContain(USER_OWNED);
      expect(prompt).not.toContain(GENERIC);
    }
  );

  it('zeigt auf den Auftrag, NICHT auf eine Stelle weiter oben im Prompt', async () => {
    // Die Vorgabe steht im Gespräch, nicht in diesem Prompt. „oben bereits
    // vorgegeben" schickte das Modell zu etwas, das dort nicht liegt.
    const prompt = await buildSystemMessage(state({ taskShape: 'strict_format' }));
    expect(prompt).not.toContain('Form und Umfang dieser Antwort sind oben bereits vorgegeben');
  });

  it('auch ein als komplex eingestufter Turn bekommt keine Überschriften befohlen', async () => {
    // `complexity` wird NACH dem Eigentümer geprüft — sonst überschreibt eine
    // lange Prüfliste den gezeichneten Tabellenkopf, den sie mitbringt.
    const prompt = await buildSystemMessage(
      state({ taskShape: 'strict_format', complexity: 'complex' })
    );
    expect(prompt).toContain(USER_OWNED);
    expect(prompt).not.toContain('Strukturiere mit');
  });

  it('unsere eigene Vorgabe bleibt stärker, wenn beide zutreffen', async () => {
    // `synthesisMode` schreibt weiter oben IN DIESEM PROMPT eine vollständige
    // Tabellenform vor — dann ist „oben" richtig und der Auftragssatz falsch.
    const prompt = await buildSystemMessage(
      state({ taskShape: 'strict_format', synthesisMode: 'table' })
    );
    expect(prompt).toContain('Form und Umfang dieser Antwort sind oben bereits vorgegeben');
    expect(prompt).not.toContain(USER_OWNED);
  });
});
