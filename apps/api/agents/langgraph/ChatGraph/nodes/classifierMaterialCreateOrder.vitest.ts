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
const executeProvider = vi.fn(async (..._args: unknown[]) => ({ content: 'keine' }));
vi.mock('../../../../services/ai/execution/index.js', () => ({
  executeProvider: (...args: unknown[]) => executeProvider(...args),
}));

const { classifierNode } = await import('./classifierNode.js');

import type { ChatGraphState, SearchIntent } from '../types.js';

/**
 * Erstell-Auftrag über gewähltem Material (Wolke, Connect, @Dokument,
 * Notebook-Quelle). Live (Prod 05.11.2026) zwang ein frisch gewähltes Wolke-Foto
 * „erstelle mir ein veranstaltungs sharepic mit diesem bild" in die Suche, und
 * der Loop ohne Erstell-Werkzeug antwortete mit Text. Geprüft am Knoten, weil
 * die Aussage die Reihenfolge ist: die Regel muss VOR den Zwangssuchen greifen.
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
    wolkeFiles: [],
    connectFiles: [],
    currentDocument: null,
    intent: 'direct' as SearchIntent,
    searchSources: [],
    searchQuery: null,
    ...rest,
  } as unknown as ChatGraphState;
}

const wolke = (name: string) => ({ shareLinkId: 'link-1', path: `/${name}`, name });
const SHAREPIC_ORDER = 'erstelle mir ein veranstaltungs sharepic mit diesem bild, mit musterdaten';

describe('classifierNode — Erstell-Auftrag über gewähltem Material', () => {
  it('Wolke-Foto + Sharepic-Auftrag → Sharepic im Einzeldurchlauf (der Prod-Fall)', async () => {
    const result = await classifierNode(
      buildState({ userMessage: SHAREPIC_ORDER, wolkeFiles: [wolke('IMG_2601 (1).jpg')] })
    );
    expect(result.intent).toBe('sharepic');
  });

  it('Wolke-PDF + Sharepic-Auftrag → Schleife, die das PDF liest', async () => {
    const result = await classifierNode(
      buildState({
        userMessage: 'Mach ein Sharepic aus dieser Pressemitteilung',
        wolkeFiles: [wolke('PM.pdf')],
      })
    );
    expect(result.intent).toBe('agentic');
  });

  it('Foto UND PDF aus der Wolke → Schleife (das PDF liest nur sie)', async () => {
    const result = await classifierNode(
      buildState({
        userMessage: SHAREPIC_ORDER,
        wolkeFiles: [wolke('foto.png'), wolke('PM.pdf')],
      })
    );
    expect(result.intent).toBe('agentic');
  });

  it('Präsentation aus einer Wolke-Datei → Schleife', async () => {
    const result = await classifierNode(
      buildState({
        userMessage: 'Erstelle eine Präsentation aus dieser Datei',
        wolkeFiles: [wolke('Konzept.docx')],
      })
    );
    expect(result.intent).toBe('agentic');
  });

  it('@Dokument + Erstell-Auftrag → Schleife statt Zwangssuche', async () => {
    const result = await classifierNode(
      buildState({
        userMessage: 'Erstelle ein Sharepic aus diesem Dokument',
        documentIds: ['doc-1'],
      })
    );
    expect(result.intent).toBe('agentic');
  });

  it('Connect-Datei + Erstell-Auftrag → Schleife', async () => {
    const result = await classifierNode(
      buildState({
        userMessage: 'Erstelle eine Präsentation aus dieser Datei',
        connectFiles: [{ provider: 'google-drive', fileId: 'f1', name: 'Konzept.docx' }],
      })
    );
    expect(result.intent).toBe('agentic');
  });

  it('Notebook-Quelle aus dem Reader + Erstell-Auftrag → Schleife', async () => {
    const result = await classifierNode(
      buildState({
        userMessage: 'Erstelle eine Präsentation aus dieser Quelle',
        notebookSources: [
          { kind: 'user', documentId: 'd1', notebookId: 'n1', ownerUserId: 'u1', title: 'Quelle' },
        ],
      })
    );
    expect(result.intent).toBe('agentic');
  });

  it('eine Frage zur Wolke-Datei geht als Material in die Schleife, mit verfeinerter Suchanfrage', async () => {
    const result = await classifierNode(
      buildState({
        userMessage: 'Was steht in dieser Datei über den Radverkehr?',
        wolkeFiles: [wolke('PM.pdf')],
      })
    );
    expect(result.intent).toBe('agentic');
    expect(result.searchQuery).toBeTruthy();
  });

  it('mitgeführte Wolke-Dateien zählen nicht als gewähltes Material', async () => {
    const result = await classifierNode(
      buildState({
        userMessage: 'Erstelle eine Präsentation zum Radverkehr',
        wolkeFiles: [wolke('PM.pdf')],
        cloudFilesCarriedOnly: true,
      })
    );
    expect(result.reasoning ?? '').not.toContain('gewähltem Material');
  });
});

/**
 * Live 06.11.2026: ein gewähltes Wolke-Foto erzwang auf JEDEM Turn `search`, und
 * `search` montiert kein Erstell-Werkzeug. Gewähltes Material ist kein Intent —
 * die Schleife liest es, und das Modell entscheidet.
 */
describe('classifierNode — gewähltes Material ist kein Intent', () => {
  const PHOTO = [wolke('IMG_2601-1365x2048 (1).jpg')];

  it('„erstelle ein bild von mir …" mit frischem Wolke-Foto → Schleife statt Suche', async () => {
    const result = await classifierNode(
      buildState({
        userMessage: 'erstelle ein bild von mir wo ich auf einer wolke surfe',
        wolkeFiles: PHOTO,
      })
    );
    expect(result.intent).toBe('agentic');
  });

  it('@Dokument, Dokument-Chat und Connect ohne Auftrag → Schleife', async () => {
    for (const material of [
      { documentIds: ['doc-1'] },
      { documentChatIds: ['chat-1'] },
      { connectFiles: [{ provider: 'google-drive', fileId: 'f1', name: 'Konzept.docx' }] },
    ]) {
      const result = await classifierNode(
        buildState({ userMessage: 'Was steht da über den Radverkehr drin?', ...material })
      );
      expect(result.intent, JSON.stringify(material)).toBe('agentic');
    }
  });

  it.each(['nimm das bild im anhang für das sharepic', 'denk dir daten dafür aus', 'ja'])(
    'eine mitgeführte Wolke-Datei beansprucht „%s" nicht',
    async (userMessage) => {
      const result = await classifierNode(
        buildState({ userMessage, wolkeFiles: PHOTO, cloudFilesCarriedOnly: true })
      );
      expect(result.reasoning ?? '').not.toMatch(/Wolke/);
      expect(result.intent).not.toBe('search');
    }
  );

  it('die @notebook-Erwähnung bleibt eine Suche', async () => {
    const result = await classifierNode(
      buildState({ userMessage: 'Was sagt das Programm zum Radverkehr?', notebookIds: ['nb-1'] })
    );
    expect(result.intent).toBe('search');
  });
});
