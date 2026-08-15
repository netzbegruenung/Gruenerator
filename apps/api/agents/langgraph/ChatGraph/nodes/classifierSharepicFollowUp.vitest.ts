import { describe, it, expect, vi } from 'vitest';

import { classifierNode } from './classifierNode.js';

import type { ChatGraphState, SearchIntent } from '../types.js';

/**
 * A follow-up on a SHAREPIC is not a raster-image edit.
 *
 * Live: after a sharepic, "Mach den Text größer" classified as `image_edit`.
 * The router's ENTIRE sharepic edit block is gated on `intent !== 'image_edit'`,
 * so the turn lost its target and answered about nothing. That it is phrasing
 * lottery rather than intent was visible in the same run: "Text größer bitte"
 * classified as `sharepic` and edited correctly.
 *
 * Das war lange eine Korrektur NACH der LLM-Stufe: die antwortete `image_edit`,
 * während ihre eigene Begründung das Sharepic benannte, und ein Guard schrieb
 * das Verdikt zurück. Mit der Stufe ist auch der Guard weg — die Formulierungen
 * beansprucht jetzt Tier 2.7 deterministisch, und kein Modell wird gefragt.
 *
 * Deshalb prüft jeder Fall unten zusätzlich, dass `processRequest` NICHT
 * aufgerufen wurde. Ohne diese Zusicherung wäre die Suite genau das, wovor ihre
 * eigene Geschichte warnt: „Mach den Text größer" wurde schon einmal von einer
 * neuen Vorstufe übernommen, und der Fall, der den Guard beweisen sollte, wäre
 * mit gelöschtem Guard grün geblieben.
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

/**
 * Ein Pool, der auf jede Frage neutral antwortet — und mitzählt, ob überhaupt
 * gefragt wurde. Genau das ist hier die Aussage: diese Turns dürfen kein Modell
 * kosten.
 */
function makeAiClient() {
  return {
    processRequest: vi.fn(async () => ({ content: 'keine' })),
  };
}

function buildState(overrides: Partial<ChatGraphState> & { userMessage: string }): ChatGraphState {
  const { userMessage, ...rest } = overrides;
  return {
    messages: [{ role: 'user' as const, content: userMessage }],
    threadId: null,
    agentConfig: STUB_AGENT_CONFIG,
    enabledTools: { search: true, web: true, image: true, image_edit: true },
    aiClient: makeAiClient(),
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

describe('classifierNode — Sharepic-Folgeauftrag vs. image_edit', () => {
  const afterSharepic = { kind: 'sharepic' as const, ref: 'canvas-1', label: 'Sharepic' };

  /**
   * Der Turn, an dem die ganze Sanierung hing.
   *
   * Er stand im Plan als die eine Vorbedingung fürs Löschen der LLM-Stufe, weil
   * dort ihr Verdikt (`image_edit`) samt Korrektur entstand. Nachgemessen war
   * die Lage eine andere: „ergänzen" und „Uhrzeit" fehlten in JEDEM Edit-Muster,
   * also beanspruchte den Turn auch im Router keine der beiden Bearbeitungs-
   * Spuren, und die Sharepic-Lizenz stufte ihn am Ende ohnehin auf `produktion`
   * zurück. Der Nutzer bekam Text statt einer Bearbeitung — mit LLM-Stufe wie
   * ohne. Nicht die Stufe fehlte, sondern zwei Wörter.
   */
  const ADD_INSTRUCTION = 'Und jetzt noch die Uhrzeit 15 Uhr ergänzen';

  it('beansprucht auch einen ERGÄNZENDEN Folgeauftrag, ohne das Modell zu fragen', async () => {
    const pool = makeAiClient();
    const result = await classifierNode(
      buildState({
        userMessage: ADD_INSTRUCTION,
        lastToolContext: afterSharepic,
        aiClient: pool as unknown as ChatGraphState['aiClient'],
      })
    );
    expect(result.intent).toBe('sharepic');
    expect(pool.processRequest).not.toHaveBeenCalled();
  });

  it('beantwortet den Standard-Folgeauftrag deterministisch, ohne das Modell zu fragen', async () => {
    const pool = makeAiClient();
    const result = await classifierNode(
      buildState({
        userMessage: 'Mach den Text größer',
        lastToolContext: afterSharepic,
        aiClient: pool as unknown as ChatGraphState['aiClient'],
      })
    );
    expect(result.intent).toBe('sharepic');
    expect(pool.processRequest).not.toHaveBeenCalled();
  });

  it('beansprucht mit angehängtem Bild NICHT auf sharepic', async () => {
    // Mit Anhang entscheiden andere Tiers, welcher Intent herauskommt. Verboten
    // ist allein `sharepic`: ein angehängtes Bild ist kein Sharepic-Folgeauftrag.
    const result = await classifierNode(
      buildState({
        userMessage: 'Mach den Text größer',
        imageAttachments: [{ mimeType: 'image/png', data: 'x' }],
        lastToolContext: afterSharepic,
      })
    );
    expect(result.intent).not.toBe('sharepic');
  });

  it('nimmt auch das BILD im Sharepic als Sharepic-Bearbeitung', async () => {
    // Umgekehrt zu früher, und mit Absicht: „das Foto" ohne Anhang ging an die
    // LLM-Stufe und wurde `image_edit` — ein Verdikt, das ohne Anhang nur „bitte
    // häng ein Bild an" produziert, während das gemeinte Bild der Hintergrund
    // des Sharepics ist. Die ausdrücklichen Formulierungen („bearbeite das
    // Bild") beansprucht weiterhin Tier 1, eine Stufe früher.
    const result = await classifierNode(
      buildState({ userMessage: 'Mach das Foto heller', lastToolContext: afterSharepic })
    );
    expect(result.intent).toBe('sharepic');
  });

  it('macht aus einem echten Bild-Kontext kein Sharepic', async () => {
    // Die Aussage, die dieser Fall immer getragen hat: dieselbe Formulierung,
    // ein anderes Artefakt, also ein anderer Intent. Dass hier zwischenzeitlich
    // das Residual herauskam, war die Lücke, die `classifierImageFollowUp`
    // schliesst — „größer/kleiner/heller" standen in keinem der beiden
    // Bildbearbeitungs-Muster.
    const result = await classifierNode(
      buildState({
        userMessage: 'Mach den Text größer',
        lastToolContext: { kind: 'image', ref: 'img-1', label: 'Bild' },
      })
    );
    expect(result.intent).toBe('image_edit');
  });

  it('greift nicht ohne vorheriges Artefakt', async () => {
    // Der Kontrollfall zur deterministischen Stufe darüber: dieselbe
    // Formulierung, aber nichts, worauf sie sich beziehen könnte. Geprüft wird
    // die AUSSAGE — Tier 2.7 darf ohne Artefakt nicht `sharepic` zurückgeben.
    // Vorher stand hier `image_edit`, was nur ein Stellvertreter dafür war,
    // dass die LLM-Stufe entschieden hat; seit der Default-Inversion landet ein
    // Turn ohne Artefakt, ohne Material und ohne Frageform im Loop. Ein
    // Fehlfeuer von Tier 2.7 fiele hier weiterhin auf, denn das ergäbe
    // `sharepic`.
    const result = await classifierNode(buildState({ userMessage: 'Mach den Text größer' }));
    expect(result.intent).not.toBe('sharepic');
  });
});
