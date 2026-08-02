import { describe, it, expect, vi } from 'vitest';

import type { ChatGraphState } from '../types.js';

/**
 * Kommt der ARTEFAKTE-Block im FERTIGEN Systemprompt an?
 *
 * Die Einheitentests daneben prüfen den Renderer. Sie hätten auch dann grün
 * gemeldet, wenn niemand ihn ruft — und genau diese Lücke ist der teure Teil:
 * der Prompt wird aus ~30 Fragmenten in einem Template zusammengesetzt, und ein
 * Fragment, das nicht in der Zeichenkette steht, existiert für das Modell nicht.
 *
 * Zwei Aufrufer, zwei Zeitpunkte, EIN Bauplatz — das ist der Grund, warum der
 * Block hier sitzt und nicht in `buildArtifactNotes`:
 *   - `chatGraphContractRouter:1818` baut ihn mit `classifiedState`, VOR dem
 *     Loop → nur frühere Artefakte, der Loop trägt seine eigenen nach.
 *   - `chatGraphContractRouter:1970` baut ihn mit `finalState`, NACH der
 *     Ausführung → die Artefakte dieses Turns stehen schon drin.
 */

vi.mock('../../../../services/docs/docsIndex.js', () => ({ buildDocsPageMap: async () => '' }));
vi.mock('../../../../services/user/textFormRepository.js', () => ({
  getTextFormForInjection: async () => null,
}));

const { buildSystemMessage } = await import('./respondNode.js');

function state(overrides: Partial<ChatGraphState> = {}): ChatGraphState {
  return {
    intent: 'agentic',
    messages: [{ role: 'user', content: 'Mach das mal schöner' }],
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

describe('ARTEFAKTE-Block im fertigen Systemprompt', () => {
  it('nennt frühere Artefakte auf einem Turn, der selbst nichts gebaut hat', async () => {
    // Der live beobachtete Fehler: „Da ich bisher kein Bild generiert habe …",
    // während das Bild im selben Thread stand.
    const prompt = await buildSystemMessage(
      state({
        threadArtifacts: [{ kind: 'image', ref: 'https://x/y.png', label: 'Windrad' }],
      })
    );
    expect(prompt).toContain('## ARTEFAKTE IN DIESEM GESPRÄCH');
    expect(prompt).toContain('Bild „Windrad" — früher in diesem Gespräch erstellt');
  });

  it('nennt die Artefakte dieses Turns, wenn der Prompt nach der Ausführung entsteht', async () => {
    const prompt = await buildSystemMessage(
      state({
        generatedImage: { url: 'https://x/y.png', prompt: 'Windrad' } as never,
        imagePrompt: 'Windrad im Sonnenuntergang',
      })
    );
    expect(prompt).toContain('Bild „Windrad im Sonnenuntergang" — in diesem Turn erstellt');
  });

  it('schweigt auf einem Thread ohne Artefakte', async () => {
    // Der Block kostet Kontext. Ein Wissens-Turn darf ihn nicht sehen.
    expect(await buildSystemMessage(state())).not.toContain('ARTEFAKTE IN DIESEM GESPRÄCH');
  });

  it('erreicht auch den Zweig mit eigenem Systemprompt', async () => {
    // Ein Thread-eigener Prompt ERSETZT die Persona — deshalb bleibt die
    // Produkt-Identität dort draussen. Welche Artefakte existieren, ist aber
    // keine Persona, sondern eine Tatsache über das Gespräch.
    const prompt = await buildSystemMessage(
      state({
        customSystemPrompt: 'Antworte wie ein Pirat.',
        threadArtifacts: [{ kind: 'sheet', ref: 'd1', label: 'Quartalszahlen' }],
      })
    );
    // Erst belegen, dass dieser Test überhaupt im anderen Zweig gelandet ist —
    // sonst prüft er denselben Pfad wie die drei darüber und beweist nichts.
    expect(prompt).toContain('Antworte wie ein Pirat.');
    expect(prompt).toContain('Tabelle „Quartalszahlen"');
  });
});
