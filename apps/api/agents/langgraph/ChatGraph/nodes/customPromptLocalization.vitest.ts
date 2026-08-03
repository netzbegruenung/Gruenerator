import { describe, it, expect, vi } from 'vitest';

import type { ChatGraphState } from '../types.js';

/**
 * Wird ein eigener Systemprompt lokalisiert, bevor er ans Modell geht?
 *
 * Der Meta-Prompt der Rollen-Erzeugung verlangt {{partyName}} wörtlich im
 * Ergebnis und begründet das damit, der Platzhalter werde zur Laufzeit
 * aufgelöst. `buildSystemMessage` löste ihn aber nur für `agentConfig.systemRole`
 * auf — eine Zeile UNTERHALB des Zweigs, der bei gesetztem `customSystemPrompt`
 * schon zurückgekehrt ist. Jede per KI erzeugte Rolle schickte die Klammern
 * dadurch roh ans Modell.
 *
 * Der Test hängt am FERTIGEN Prompt, nicht am Helfer: dass
 * `localizePlaceholders` ersetzt, war nie das Problem — dass niemand ihn auf
 * diesem Pfad ruft, schon.
 */

vi.mock('../../../../services/docs/docsIndex.js', () => ({ buildDocsPageMap: async () => '' }));
vi.mock('../../../../services/user/textFormRepository.js', () => ({
  getTextFormForInjection: async () => null,
}));

const { buildSystemMessage } = await import('./respondNode.js');

const ROLE_PROMPT =
  'Du bist ein*e Referent*in im Bundestagsbüro für {{partyName}}. ' +
  'Du arbeitest der Abgeordneten zu und schreibst, was das Büro nach außen gibt.';

function state(overrides: Partial<ChatGraphState> = {}): ChatGraphState {
  return {
    intent: 'agentic',
    messages: [{ role: 'user', content: 'Schreib mir eine Pressemitteilung' }],
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

describe('Platzhalter im eigenen Systemprompt', () => {
  it('löst {{partyName}} für Deutschland auf', async () => {
    const prompt = await buildSystemMessage(
      state({ customSystemPrompt: ROLE_PROMPT, userLocale: 'de-DE' })
    );

    expect(prompt).toContain('im Bundestagsbüro für Bündnis 90/Die Grünen.');
    expect(prompt).not.toContain('{{partyName}}');
  });

  it('löst denselben Platzhalter für Österreich anders auf', async () => {
    // Der eigentliche Zweck der Platzhalter: EIN gespeicherter Rollen-Prompt,
    // zwei Länder. Ohne diesen Zweig hätte auch ein AT-Konto den deutschen
    // Parteinamen gelesen — oder eben die rohen Klammern.
    const prompt = await buildSystemMessage(
      state({ customSystemPrompt: ROLE_PROMPT, userLocale: 'de-AT' })
    );

    // Auf den Rollensatz genau prüfen, nicht auf den ganzen Prompt: der
    // AT-Gebietsschema-Block nennt „Bündnis 90/Die Grünen" selbst, um es
    // abzugrenzen.
    expect(prompt).toContain('im Bundestagsbüro für Die Grünen – Die Grüne Alternative.');
    expect(prompt).not.toContain('für Bündnis 90/Die Grünen.');
  });

  it('fällt ohne gesetztes Gebietsschema auf de-DE zurück', async () => {
    const prompt = await buildSystemMessage(state({ customSystemPrompt: ROLE_PROMPT }));

    expect(prompt).toContain('Bündnis 90/Die Grünen');
    expect(prompt).not.toContain('{{');
  });

  it('lässt einen Prompt ohne Platzhalter unangetastet', async () => {
    const plain = 'Du bist ein*e Übersetzer*in. Übertrage Texte ins Englische.';
    const prompt = await buildSystemMessage(state({ customSystemPrompt: plain }));

    expect(prompt).toContain(plain);
  });
});
