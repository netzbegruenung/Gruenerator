import { describe, it, expect, vi } from 'vitest';

import type { ChatGraphState } from '../types.js';

/**
 * Der Absagesatz der Dokument-Fläche, geprüft am FERTIGEN Systemprompt.
 *
 * `getModeGuidance` isoliert zu prüfen genügt hier nicht, und das war der
 * Fehler: dieselbe Funktion beliefert BEIDE Pfade. `responseSinglePass` baut
 * den Prompt und antwortet damit — dort gehört der Satz hin. `responseAgentic`
 * baut denselben Prompt (`buildSystemMessage(classifiedState, …)`) und gibt ihn
 * an das WERKZEUGHALTENDE Modell weiter; dort stand der Satz bis zur Korrektur
 * neben der Persona-Regel „Rufe IMMER das Tool `edit_document` auf" und neben
 * der Werkzeugbeschreibung selbst.
 *
 * Deshalb hängt die Entscheidung an `state.editToolSurface` (montiert der
 * Router das Werkzeug?) und nicht am Verdikt `edit_current_doc`.
 */

vi.mock('../../../../services/docs/docsIndex.js', () => ({ buildDocsPageMap: async () => '' }));
vi.mock('../../../../services/user/textFormRepository.js', () => ({
  getTextFormForInjection: async () => null,
}));
vi.mock('../../../../services/skills/internalPrompts.js', () => ({
  getInternalSkillPrompt: () => null,
}));

const { buildSystemMessage } = await import('./respondNode.js');

/** The one sentence the model must never be handed on a turn that CAN edit. */
const REFUSAL = 'nicht direkt bearbeiten';
/** The `currentDocument` anchor adjunct — shared with the sharepic studio. */
const ANCHOR = 'Schreibe das Dokument NICHT um';

function docTurn(overrides: Partial<ChatGraphState> = {}): ChatGraphState {
  return {
    intent: 'edit_current_doc',
    messages: [{ role: 'user', content: 'Kürze den ersten Absatz' }],
    searchResults: [],
    citations: [],
    agentConfig: {
      identifier: 'gruenerator-docs-editor',
      systemRole: 'Du bist der Dokument-Assistent.',
    },
    enabledTools: { edit_current_doc: true },
    currentDocument: {
      id: 'doc-1',
      title: null,
      markdown: '# Antrag\n\nEin langer erster Absatz.',
      selectionText: null,
    },
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

describe('Dokument-Fläche: der Absagesatz im fertigen Systemprompt', () => {
  it('fehlt, wenn der Loop das edit_document der Dokument-Fläche montiert hat', async () => {
    const prompt = await buildSystemMessage(docTurn({ editToolSurface: 'doc' }), {
      retrievalExpected: true,
    });
    expect(prompt).not.toContain(REFUSAL);
  });

  it('steht da, wenn dieser Zug gar keinen Bearbeitungsweg hat', async () => {
    // Was `decideEditToolLoop` zurückhält (Bildanhang, gewähltes Notebook,
    // Zweit-Intent, Loop aus): `editToolSurface` bleibt ungesetzt, und die
    // Stufe, die früher trotzdem `trigger_doc_edit` schickte, gibt es nicht mehr.
    const prompt = await buildSystemMessage(docTurn());
    expect(prompt).toContain(REFUSAL);
    expect(prompt).toContain('hier ist mein Vorschlag als Text');
  });

  // Die Anker-Beigabe gilt auf BEIDEN Zügen — dieselbe, die die
  // Sharepic-Fläche über `anchorContext` bekommt (dort trägt `currentCanvas`
  // den `currentDocument`-Anker). Ihre Ausnahme („ausser der*die Nutzer*in
  // fragt explizit danach") deckt die ausdrückliche Bearbeitungsbitte ab.
  it('trägt die currentDocument-Beigabe in beiden Fällen', async () => {
    expect(
      await buildSystemMessage(docTurn({ editToolSurface: 'doc' }), { retrievalExpected: true })
    ).toContain(ANCHOR);
    expect(await buildSystemMessage(docTurn())).toContain(ANCHOR);
  });
});
