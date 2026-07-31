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
 * The LLM tier is mocked to return `image_edit`, because that is where the real
 * misroute came from — the deterministic tiers never fire for this wording (no
 * attachment, no image noun). A first version of this suite phrased the prompt
 * with the word "sharepic", which an earlier heuristic tier catches on its own:
 * it passed with the fix reverted and proved nothing.
 *
 * The same trap re-opened when Tier 2.7 learned to answer sharepic follow-ups
 * itself: "Mach den Text größer" stopped reaching the LLM at all, so the case
 * that used to prove the post-LLM guard would have passed with the guard
 * deleted. The LLM-tier cases below therefore use a wording the deterministic
 * branch does NOT claim ("ergänzen" is in neither edit-verb pattern), and the
 * deterministic branch has its own case that asserts the model was never asked.
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

/** LLM tier mock: reproduces the observed self-contradiction — the reasoning
 *  names the sharepic, the intent field says image_edit. */
function makeWorkerPool() {
  return {
    processRequest: vi.fn(async () => ({
      content: JSON.stringify({
        intent: 'image_edit',
        reasoning:
          'Der Nutzer möchte ein bereits erstelltes Sharepic aus dem vorherigen Gesprächsschritt bearbeiten.',
        searchQuery: null,
      }),
    })),
  };
}

function buildState(overrides: Partial<ChatGraphState> & { userMessage: string }): ChatGraphState {
  const { userMessage, ...rest } = overrides;
  return {
    messages: [{ role: 'user' as const, content: userMessage }],
    threadId: null,
    agentConfig: STUB_AGENT_CONFIG,
    enabledTools: { search: true, web: true, image: true, image_edit: true },
    aiWorkerPool: makeWorkerPool(),
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

  /** Erreicht die LLM-Stufe wirklich: kein Verb aus EDIT_VERB_PATTERN, kein
   *  Substantiv aus EDIT_NOUN_PATTERN — Tier 2.7 lässt den Turn also durch. */
  const REACHES_LLM = 'Und jetzt noch die Uhrzeit 15 Uhr ergänzen';

  it('korrigiert das LLM, wenn es einen Sharepic-Folgeauftrag image_edit nennt', async () => {
    const pool = makeWorkerPool();
    const result = await classifierNode(
      buildState({
        userMessage: REACHES_LLM,
        lastToolContext: afterSharepic,
        aiWorkerPool: pool as unknown as ChatGraphState['aiWorkerPool'],
      })
    );
    // Ohne diese Zusicherung prüft der Fall den Nach-LLM-Guard nicht mehr,
    // sobald eine deterministische Stufe die Formulierung übernimmt.
    expect(pool.processRequest).toHaveBeenCalled();
    expect(result.intent).not.toBe('image_edit');
    expect(result.intent).toBe('sharepic');
  });

  it('beantwortet den Standard-Folgeauftrag deterministisch, ohne das Modell zu fragen', async () => {
    const pool = makeWorkerPool();
    const result = await classifierNode(
      buildState({
        userMessage: 'Mach den Text größer',
        lastToolContext: afterSharepic,
        aiWorkerPool: pool as unknown as ChatGraphState['aiWorkerPool'],
      })
    );
    expect(result.intent).toBe('sharepic');
    expect(pool.processRequest).not.toHaveBeenCalled();
  });

  it('schreibt mit angehängtem Bild NICHT auf sharepic um', async () => {
    // Geprüft wird der Guard, nicht die Stufe davor: mit Anhang entscheiden
    // andere Tiers, welcher Intent herauskommt (hier `direct`, weil "Mach …
    // größer" kein Bildbearbeitungs-Verb ist). Verboten ist allein, dass der
    // Sharepic-Downgrade greift — mit einem Anhang ist er nie richtig.
    const result = await classifierNode(
      buildState({
        userMessage: 'Mach den Text größer',
        imageAttachments: [{ mimeType: 'image/png', data: 'x' }],
        lastToolContext: afterSharepic,
      })
    );
    expect(result.intent).not.toBe('sharepic');
  });

  it('lässt image_edit stehen, wenn der Nutzer ausdrücklich ein Bild nennt', async () => {
    // "das Foto" beim Wort nehmen: gemeint sein kann das Hintergrundbild des
    // Sharepics. Diese Grenze ist der Grund, warum der Guard nicht allein auf
    // lastToolContext schaut.
    const result = await classifierNode(
      buildState({ userMessage: 'Mach das Foto heller', lastToolContext: afterSharepic })
    );
    expect(result.intent).toBe('image_edit');
  });

  it('greift nicht, wenn der letzte Turn ein echtes Bild war', async () => {
    const result = await classifierNode(
      buildState({
        userMessage: 'Mach den Text größer',
        lastToolContext: { kind: 'image', ref: 'img-1', label: 'Bild' },
      })
    );
    expect(result.intent).toBe('image_edit');
  });

  it('greift nicht ohne vorheriges Artefakt', async () => {
    const result = await classifierNode(buildState({ userMessage: 'Mach den Text größer' }));
    expect(result.intent).toBe('image_edit');
  });
});
