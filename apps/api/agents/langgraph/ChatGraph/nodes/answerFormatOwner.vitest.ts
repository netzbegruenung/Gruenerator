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
// Der Rezept-Rumpf liegt im privaten Repo und fehlt im Test-Lauf. Er wird hier
// gestellt, weil die Formatregel am EINGESETZTEN Fragment haengt, nicht an der
// Erwaehnung — ohne Rumpf gaebe es (richtigerweise) keinen Eigentuemer.
vi.mock('../../../../services/skills/internalPrompts.js', () => ({
  getInternalSkillPrompt: (mention: string) =>
    mention.startsWith('presse')
      ? 'Aufbau einer Pressemitteilung: Schlagzeile, Zitat, Kontakt.'
      : null,
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

/**
 * Eine gewaehlte Textform ist der vierte Eigentuemer.
 *
 * Beta, 20.08.2026: `/presse mehr artenschutz in ludwigshafen` lief als
 * `agentic` mit `retrievalExpected` und fiel damit in `research_expanded` —
 * „Bis zu 6 Absaetze … gliedere sie mit Ueberschriften … setze sie als
 * Aufzaehlung … **Fettung**". Genau das kam heraus, statt einer
 * Pressemitteilung. Das Rezept stand im selben Prompt, nur ganz oben; diese
 * Regel steht unter ANTWORT-REGELN, also zuletzt.
 */
describe('Formatregel — eine gewaehlte Textform ist ein Eigentuemer', () => {
  const TEXTFORM_OWNED = 'Form und Umfang gibt die oben aktive Textform vor';

  it('verdraengt die Rechercheform, die den Live-Ausfall erzeugt hat', async () => {
    const prompt = await buildSystemMessage(state({ activeSkillMention: 'presse' }), {
      retrievalExpected: true,
    });
    expect(prompt).toContain(TEXTFORM_OWNED);
    expect(prompt).not.toContain('gliedere sie mit');
    expect(prompt).not.toContain(GENERIC);
  });

  it('ohne Textform bleibt die Rechercheform stehen', async () => {
    const prompt = await buildSystemMessage(state(), { retrievalExpected: true });
    expect(prompt).toContain('gliedere sie mit');
    expect(prompt).not.toContain(TEXTFORM_OWNED);
  });

  // Der Rumpf ist die Bedingung, nicht die Absicht: zeigt die Regel auf „oben",
  // muss oben auch etwas stehen. `getInternalSkillPrompt` liefert fuer ein
  // nicht ausgerolltes Rezept null.
  it('schweigt, wenn zur Erwaehnung gar kein Rezepttext gefunden wurde', async () => {
    const prompt = await buildSystemMessage(state({ activeSkillMention: 'gibtsnicht' }), {
      retrievalExpected: true,
    });
    expect(prompt).not.toContain(TEXTFORM_OWNED);
    expect(prompt).toContain('gliedere sie mit');
  });

  // Was die Person in DIESEM Turn schreibt, schlaegt das Rezept.
  it('ein Formatvertrag im Auftrag gewinnt gegen die Textform', async () => {
    const prompt = await buildSystemMessage(
      state({ activeSkillMention: 'presse', taskShape: 'strict_format' }),
      { retrievalExpected: true }
    );
    expect(prompt).toContain(USER_OWNED);
    expect(prompt).not.toContain(TEXTFORM_OWNED);
  });
});

/**
 * Position 2 der Gleichmacher-Liste (R1 §4), erste Hälfte: `search` steht NICHT
 * in `EXTERNAL_RESEARCH_INTENTS` und ist damit als einziges Mitglied der
 * Suchfamilie von der Gliederungsregel ausgeschlossen.
 *
 * Festgenagelt statt gleichgemacht, weil der Zweig ERREICHBAR ist und bleibt —
 * das ist die Prüfung, die Phase R3 an dieser Position verlangt. Drei Wege
 * führen mit `intent: 'search'` in `respondNode`:
 *
 *  1. `@dokumente` — die Erwähnung setzt das Verdikt, und sie behält es auch
 *     nach dem Lane-Flip (der ändert die LANE, nicht den Intent).
 *  2. `CHAT_AGENT_LOOP=false` — `fallbackIntentFor` schreibt jeden demotierten
 *     `agentic`-Turn auf `search` um.
 *  3. Ein Klassifikator-Verdikt `search`, das ein Notausschalter (gewählte
 *     Wissenssammlung, Verbund, Bildanhang) aus der Schleife hält.
 *
 * Weg 2 ist zugleich die Asymmetrie, die diese Zeile kostet: DERSELBE Turn
 * bekommt mit eingeschalteter Schleife (`agentic`, in der Menge) die
 * Gliederungsregel und mit ausgeschalteter (`search`, nicht in der Menge) den
 * generischen Satz. Ein Deployment-Schalter entscheidet über die Antwortform.
 * Nicht in R3 geändert: es ist eine Aussage über die Quellenart (extern vs.
 * hauseigene Dokumente), sie ist von keinem Korpus-Szenario beobachtet, und
 * eine unbeobachtete Formänderung gehört nicht in denselben PR wie ein
 * gemessener Lane-Wechsel.
 */
describe('Formatregel — die Suchfamilie fällt an EXTERNAL_RESEARCH_INTENTS auseinander', () => {
  const EXPANDED = 'gliedere sie mit';

  it.each(['research', 'web', 'agentic'] as const)(
    '%s bekommt die Gliederungsregel, sobald Abruf erwartet wird',
    async (intent) => {
      const prompt = await buildSystemMessage(state({ intent }), { retrievalExpected: true });
      expect(prompt).toContain(EXPANDED);
      expect(prompt).not.toContain(GENERIC);
    }
  );

  it('search bekommt sie nicht — auch nicht mit erwartetem Abruf', async () => {
    const prompt = await buildSystemMessage(state({ intent: 'search' }), {
      retrievalExpected: true,
    });
    expect(prompt).toContain(GENERIC);
    expect(prompt).not.toContain(EXPANDED);
  });

  // Und auch nicht mit zehn bereits gezählten Quellen, also auf dem Weg, den
  // der Einzeldurchlauf nimmt (dort ist `retrievalExpected` false und die Zahl
  // echt). Die Schwelle liegt bei 4.
  it('search bekommt sie auch mit zehn gezählten Quellen nicht', async () => {
    const citations = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      title: `Quelle ${i + 1}`,
      url: `https://example.org/${i + 1}`,
      snippet: 'x',
      source: 'gruenerator',
    }));
    const prompt = await buildSystemMessage(state({ intent: 'search', citations }));
    expect(prompt).toContain(GENERIC);
    expect(prompt).not.toContain(EXPANDED);
  });
});

/**
 * Position 2 der Gleichmacher-Liste (R1 §4), zweite Hälfte: `isPolishedContent`
 * unterdrückt Inline-Zitate für einen erkannten Textsorten-Auftrag — ausser der
 * Intent ist `search`.
 *
 * Der Kommentar an der Zeile sagte „research questions always cite inline",
 * die Zeile nennt aber nur `search`. Beides zugleich stimmt nicht, und der
 * Unterschied ist erreichbar: `contentType` wird ausschliesslich von den drei
 * `produktion.*`-Regeln der Heuristik gesetzt, den Intent überschreibt danach
 * die Erwähnung (`forcedIntentStage` läuft NACH dem Klassifikator). Also:
 *
 *   `@dokumente` + „schreib eine Pressemitteilung über X" → Inline-Zitate
 *   `@recherche` + derselbe Satz                          → keine
 *
 * Festgenagelt statt gleichgemacht: welche der beiden Seiten richtig ist, ist
 * eine PRODUKTfrage (entscheidet die Erwähnung die Quelle oder auch die Form?),
 * kein Lane-Problem — und kein Korpus-Szenario beobachtet sie. Die zwei
 * Erwähnungs-Anker aus R2 stellen Fragen, keine Schreibaufträge, und bleiben
 * deshalb auf beiden Seiten unberührt.
 */
describe('Inline-Zitate — die Textsorte schlägt die Erwähnung, ausser bei @dokumente', () => {
  const SUPPRESSED = 'setze KEINE Inline-Quellenverweise';
  const CITE_INLINE = 'als Quellenverweise';

  const withSources = (over: Partial<ChatGraphState>): ChatGraphState =>
    state({
      searchResults: [
        { source: 'gruenerator:test', title: 'Wahlprogramm', content: 'x'.repeat(50) },
      ],
      citations: [
        {
          id: 1,
          title: 'Wahlprogramm',
          url: 'https://example.org/1',
          snippet: 'x',
          source: 'gruenerator',
        },
      ],
      ...over,
    } as Partial<ChatGraphState>);

  it('ein Schreibauftrag unterdrückt die Inline-Marker', async () => {
    const prompt = await buildSystemMessage(
      withSources({ intent: 'research', contentType: 'pressemitteilung' })
    );
    expect(prompt).toContain(SUPPRESSED);
    expect(prompt).not.toContain(CITE_INLINE);
  });

  it('unter search NICHT — dort gewinnt die Frage gegen die Textsorte', async () => {
    const prompt = await buildSystemMessage(
      withSources({ intent: 'search', contentType: 'pressemitteilung' })
    );
    expect(prompt).toContain(CITE_INLINE);
    expect(prompt).not.toContain(SUPPRESSED);
  });

  it('ohne Textsorte zitiert jeder Intent der Familie inline', async () => {
    for (const intent of ['research', 'search', 'web'] as const) {
      const prompt = await buildSystemMessage(withSources({ intent, contentType: null }));
      expect(prompt, intent).toContain(CITE_INLINE);
      expect(prompt, intent).not.toContain(SUPPRESSED);
    }
  });
});
