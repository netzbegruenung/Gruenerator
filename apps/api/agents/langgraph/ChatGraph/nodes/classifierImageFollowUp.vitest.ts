import { describe, it, expect, vi } from 'vitest';

/**
 * Der Klassifikator ruft das Modell über `executeProvider` — nicht mehr über
 * einen `aiClient` im Zustand. Die Attrappe muss deshalb an dieser Tür stehen;
 * eine im Zustand hinterlegte wäre eine, die nichts abfängt: der echte Provider
 * würde versucht, am fehlenden API-Key scheitern und die Entscheidung in eine
 * heuristische Stufe zurückfallen lassen — grün gemeldet, nichts geprüft.
 *
 * `keine` heisst bei jedem der kleinen Auflöser „ich entscheide hier nichts".
 */
const executeProvider = vi.fn(async () => ({ content: 'keine' }));
vi.mock('../../../../services/ai/execution/index.js', () => ({
  executeProvider: (...args: unknown[]) => executeProvider(...args),
}));

const { classifierNode } = await import('./classifierNode.js');

import type { ChatGraphState, SearchIntent } from '../types.js';

/**
 * Folgeaufträge auf ein erzeugtes BILD.
 *
 * Schwesterdatei zu `classifierSharepicFollowUp.vitest.ts`, und aus demselben
 * Befund entstanden: die Bearbeitungs-Vokabeln von Tier 2.7 kannten für Bilder
 * nur zwei Formen — das ausdrückliche Verb („bearbeite das Foto") und das
 * Neu-Würfeln („nochmal, aber abends"). Die häufigste Form, die vergleichende
 * Anweisung mit benanntem Bildteil, kannten sie nicht. Solange die LLM-Stufe
 * darunter lag, fing sie diese Turns auf; nach deren Löschung fielen sechs von
 * zehn gemessenen Formulierungen ins Residual und wurden mit Prosa beantwortet,
 * obwohl ein Bild zum Bearbeiten dalag.
 *
 * Geprüft wird am Knoten, nicht am Prädikat: die Aussage ist die Reihenfolge der
 * Stufen (Tier 2.7 vor der Regeltabelle) plus das Vokabular, und ein Test auf
 * `isImageEditInstruction` allein bliebe grün, wenn eine frühere Stufe den Turn
 * wegnimmt. Jeder Fall prüft zusätzlich, dass kein Modell gefragt wurde — diese
 * Turns sind deterministisch oder sie sind nichts.
 */

const STUB_AGENT_CONFIG = {
  identifier: 'gruenerator-universal',
  name: 'Test Agent',
  systemPrompt: 'Du bist ein Assistent.',
  allowedCollections: null,
  description: '',
  avatar: '',
  backgroundColor: '',
  slug: 'test',
  isSystemDefault: true,
};

function buildState(
  overrides: Partial<ChatGraphState> & {
    userMessage: string;
  }
): ChatGraphState {
  const { userMessage, ...rest } = overrides;
  return {
    messages: [{ role: 'user' as const, content: userMessage }],
    threadId: null,
    agentConfig: STUB_AGENT_CONFIG,
    enabledTools: { search: true, web: true, image: true, image_edit: true },
    userLocale: 'de-DE',
    attachmentContext: null,
    imageAttachments: [],
    threadAttachments: [],
    notebookIds: [],
    notebookCollectionIds: [],
    notebookDocumentIds: [],
    defaultNotebookCollectionIds: [],
    documentIds: [],
    documentChatIds: [],
    docMentionIds: [],
    currentDocument: null,
    intent: 'direct' as SearchIntent,
    searchSources: [],
    searchQuery: null,
    ...rest,
  } as unknown as ChatGraphState;
}

const afterImage = { kind: 'image' as const, ref: 'img-1', label: 'Bild' };

describe('classifierNode — Bild-Folgeauftrag', () => {
  it.each([
    'Mach den Text größer',
    'Mach das Bild heller',
    'Mach das Foto heller',
    'Mach den Hintergrund dunkler',
    'Entferne das Logo',
    'Das Motiv etwas kleiner',
    // Die beiden Formen, die schon vorher trugen — als Kontrolle, dass die
    // Erweiterung sie nicht verdrängt hat.
    'Ändere die Farbe',
    'Mach es heller',
    'Nochmal, aber abends',
    'bearbeite das Bild',
  ])('beansprucht "%s" als Bildbearbeitung, ohne das Modell zu fragen', async (text) => {
    const result = await classifierNode(
      buildState({ userMessage: text, lastToolContext: afterImage })
    );
    expect(result.intent).toBe('image_edit');
    expect(executeProvider).not.toHaveBeenCalled();
  });

  it('lässt einen NEUEN Bildauftrag durch, statt ihn als Bearbeitung zu nehmen', async () => {
    // Verb und Nomen sind dieselben wie oben — unterschieden wird am
    // unbestimmten Artikel. Ohne diesen Wächter würde FLUX das alte Bild
    // Richtung „ein neues Bild" bearbeiten, also Unsinn erzeugen.
    const result = await classifierNode(
      buildState({ userMessage: 'Mach mir ein neues Bild', lastToolContext: afterImage })
    );
    expect(result.intent).not.toBe('image_edit');
  });

  it('nimmt „setz eine Sonnenblume ins Bild" weiterhin als Bearbeitung', async () => {
    // Der Gegenbeleg zum Wächter darüber: ein unbestimmter Artikel steht hier
    // vor dem EINGEFÜGTEN Ding, nicht vor dem Bild. Ein weiter gefasster
    // Wächter hätte genau diese Formulierung mitgenommen.
    const result = await classifierNode(
      buildState({ userMessage: 'Setz eine Sonnenblume ins Bild', lastToolContext: afterImage })
    );
    expect(result.intent).toBe('image_edit');
  });

  it.each(['Mach das Plakat heller', 'Mach das Poster heller'])(
    'nimmt "%s" als Bildbearbeitung',
    async (text) => {
      // Plakat/Poster benennen hier dasselbe wie „Bild"/„Motiv": das ganze
      // Artefakt. „Poster" bestand die Prüfung vorher nur durch Zufall — das
      // Neu-Würfel-Muster sucht „mach das …er", und Poster endet auf -er.
      const result = await classifierNode(
        buildState({ userMessage: text, lastToolContext: afterImage })
      );
      expect(result.intent).toBe('image_edit');
    }
  );

  it.each([
    ['Was ist auf dem Bild zu sehen?', 'Frage über das Bild, keine Anweisung'],
    ['Erklär mir das nochmal', 'Wiederholung der ANTWORT, nicht des Bildes'],
    ['Zeig mir Bilder von Windrädern', 'Suche nach fremden Bildern'],
    ['Schreib eine Pressemitteilung dazu', 'anderes Artefakt'],
    // Bitte um Rat: Verb und Bildteil wie eine Bearbeitung, gemeint ist das
    // Gegenteil. Ohne Wächter lud der Router das Bild nach und schickte es an
    // FLUX — der Nutzer bekam ein verändertes Bild statt einer Meinung.
    ['Mach mal einen Vorschlag, wie der Hintergrund besser wirken könnte', 'Bitte um Rat'],
    ['Gib mir Ideen, wie man das Motiv stärker macht', 'Bitte um Ideen'],
    // Verneinung: die Anweisung steht da, das Verbot dahinter. Beide Stufen
    // müssen es lesen — was Tier 1 beansprucht, prüft danach niemand mehr.
    ['Ändere das Bild nicht, sag mir nur was drauf ist', 'ausdrückliches Verbot'],
  ])('lässt "%s" in Ruhe (%s)', async (text) => {
    const result = await classifierNode(
      buildState({ userMessage: text, lastToolContext: afterImage })
    );
    expect(result.intent).not.toBe('image_edit');
  });

  it('greift nicht ohne vorheriges Bild', async () => {
    // Der Grund, warum ein blosses Bildteil-Nomen hier reichen darf: die Stufe
    // weiss bereits, dass ein Bild dasteht. Ohne Artefakt darf „Mach den Text
    // größer" nichts mit Bildbearbeitung zu tun haben — sonst hätte die
    // Erweiterung Tier 1 mitverschoben, wo dasselbe Nomen jeden Textauftrag
    // in die Bildbearbeitung zöge.
    const result = await classifierNode(buildState({ userMessage: 'Mach den Text größer' }));
    expect(result.intent).not.toBe('image_edit');
  });

  it('greift nicht, wenn ein Bild ANGEHÄNGT ist', async () => {
    // Mit Anhang entscheiden die Stufen davor; dieser Zweig ist ausdrücklich
    // der Fall OHNE Anhang, weil nur dort der Router das letzte erzeugte Bild
    // nachlädt.
    const result = await classifierNode(
      buildState({
        userMessage: 'Mach den Hintergrund dunkler',
        imageAttachments: [{ mimeType: 'image/png', data: 'x' }],
        lastToolContext: afterImage,
      })
    );
    expect(result.reasoning).not.toContain('lastToolContext(image)');
  });
});
