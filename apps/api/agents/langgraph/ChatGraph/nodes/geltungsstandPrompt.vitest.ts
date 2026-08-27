import { describe, it, expect, vi } from 'vitest';

import type { ChatGraphState } from '../types.js';

/**
 * Die Stand-Disziplin im Systemprompt (#2949).
 *
 * Die erzwungene Suche ist nur die halbe Reparatur, und die andere Hälfte ist
 * die, die man leicht vergisst: eine Antwort, die zwei Meldungen über einen
 * Änderungsvorschlag zitiert, ist belegt und trotzdem falsch verstanden.
 * Deshalb hängt diese Regel NICHT am Quellenblock — sie muss auch dann im
 * Prompt stehen, wenn nichts gefunden wurde.
 *
 * Geprüft am FERTIGEN Prompt und in BEIDEN Rückgabezweigen: der
 * `customSystemPrompt`-Zweig überspringt ANTWORT-REGELN und `intentGuidance`
 * vollständig, und genau dort laufen die Rollen der Bundesgeschäftsstelle —
 * also die Nutzer*innen, aus deren Prüfplan dieser Befund stammt.
 */

vi.mock('../../../../services/docs/docsIndex.js', () => ({ buildDocsPageMap: async () => '' }));
vi.mock('../../../../services/user/textFormRepository.js', () => ({
  getTextFormForInjection: async () => null,
}));
vi.mock('../../../../services/skills/internalPrompts.js', () => ({
  getInternalSkillPrompt: () => null,
}));

const { buildSystemMessage } = await import('./respondNode.js');

const MARKER = 'GELTUNGSSTAND:';
const GELTUNGSFRAGE =
  'Gilt das Verbrenner-Aus ab 2035 in der EU noch? Antworte in zwei getrennten ' +
  'Abschnitten: (a) was rechtlich in Kraft ist, (b) was politisch verhandelt wird ' +
  'und noch nicht gilt. Nenne für beides den Rechtsakt bzw. das Verfahrensstadium.';

function state(text: string, overrides: Partial<ChatGraphState> = {}): ChatGraphState {
  return {
    intent: 'agentic',
    messages: [{ role: 'user', content: text }],
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

describe('Geltungsstand-Regel', () => {
  it('steht im Prompt, wenn der Turn nach einem Rechts-/Verfahrensstand fragt', async () => {
    const prompt = await buildSystemMessage(state(GELTUNGSFRAGE));
    expect(prompt).toContain(MARKER);
  });

  it('fehlt bei einer gewöhnlichen Frage', async () => {
    const prompt = await buildSystemMessage(state('Was bringt Tempo 30 in der Innenstadt?'));
    expect(prompt).not.toContain(MARKER);
  });

  // Der Zweig, den man vergisst: eine Rolle ersetzt die Persona und mit ihr den
  // ganzen ANTWORT-REGELN-Block. Eine Regel, die nur dort unten steht, erreicht
  // die BGSt nie.
  it('steht auch im Prompt einer Rolle (customSystemPrompt)', async () => {
    const prompt = await buildSystemMessage(
      state(GELTUNGSFRAGE, {
        customSystemPrompt: 'Du schreibst für die Bundesgeschäftsstelle.',
      } as Partial<ChatGraphState>)
    );
    expect(prompt).toContain('Du schreibst für die Bundesgeschäftsstelle.');
    expect(prompt).toContain(MARKER);
  });

  /**
   * Dieselbe Funktion genügt nicht — sie muss dieselbe SICHT bekommen.
   *
   * Der Klassifikator gibt dem Prädikat `m.stripped`, also den Text ohne
   * zitierte Spannen. Roher Text hier hiesse: kein erzwungener Abruf, aber die
   * Rechtsstand-Regel trotzdem im Prompt — die Drift aus dem Kommentar an
   * `geltungsstandNote`, nur über die Eingabe statt über einen zweiten
   * Detektor. Gefunden im Review von #2952.
   */
  it('ignoriert eine ZITIERTE Geltungsfrage — wie der Klassifikator auch', async () => {
    const prompt = await buildSystemMessage(
      state(
        'Ein Kollege fragte mich: "Gilt das Verbrenner-Aus 2035 noch?" Hilf mir bei etwas anderem.'
      )
    );
    expect(prompt).not.toContain(MARKER);
  });

  // Die vier Aussagen der Regel, einzeln festgehalten: jede trägt einen eigenen
  // Fehler aus dem Befund, und eine gekürzte Fassung sähe sonst grün aus.
  it.each([
    ['trennt Geltung von Vorhaben', 'HEUTE GILT'],
    ['verlangt den Rechtsakt', 'Rechtsakt'],
    ['verlangt das Verfahrensstadium', 'Verfahrensstadium'],
    ['verlangt den Stand mit Datum', 'Stand mit Datum'],
    ['warnt vor der Meldung über den Vorschlag', 'ist keine Meldung über geltendes Recht'],
    ['verlangt die Offenlegung bei fehlendem Abruf', 'nichts nachgeschlagen'],
  ])('%s', async (_name, needle) => {
    const prompt = await buildSystemMessage(state(GELTUNGSFRAGE));
    expect(prompt).toContain(needle);
  });
});
