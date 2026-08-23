/**
 * Der Vorab-Seed: die angehängten Dokumente werden EINMAL abgerufen, bevor der
 * Planer seinen ersten Zug macht.
 *
 * Eigene Datei und nicht in `catalogAssembly.vitest.ts`, obwohl die Funktion
 * dort wohnt: der Seed braucht ein gemocktes `searchNode`, und in der grossen
 * Nachbardatei — die über `assembleToolCatalog` den halben Werkzeugkatalog
 * lädt — wurde ein Fehler aus diesem Mock dem Test zusätzlich als Fehlschlag
 * angelastet, obwohl er gefangen war. Getrennt laufen beide sauber.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { seedAttachedDocuments } from './catalogAssembly.js';
import { createSourceRegistry } from './sourceRegistry.js';

import type { ChatGraphState } from '../../../../agents/langgraph/ChatGraph/types.js';

const fanout = vi.hoisted(() => vi.fn<(...a: unknown[]) => Promise<unknown>>());
vi.mock('../../../../agents/langgraph/ChatGraph/nodes/searchNode.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  executeMultiDocFanout: (...a: unknown[]) => fanout(...a),
}));
/**
 * Die beiden Kanäle sind der Kern — der Schreiber liest die Quellenregistry,
 * der Planer sieht sie nie und braucht das Ergebnis als Werkzeug-Wiedergabe.
 * Fiele einer weg, wäre der Ausfall vom 23.08.2026 zur Hälfte wieder da: mit
 * Quellen, aber einem Planer, der weitersucht — oder umgekehrt.
 */
describe('seedAttachedDocuments', () => {
  const stateWith = (over: Record<string, unknown> = {}) =>
    ({
      documentSources: [{ kind: 'document_chat', id: 'doc-1', label: 'Beschluss.pdf' }],
      searchQuery: 'Zusammenfassung des PDFs',
      lastUserTextNoMentions: 'fasse das pdf zusammen',
      agentConfig: { userId: 'u1' },
      ...over,
    }) as unknown as ChatGraphState;

  const hit = {
    source: 'documentchat:doc-1',
    title: 'Beschluss.pdf',
    content: 'Radverkehr wird ausgebaut.',
    relevance: 0.8,
  };

  const run = (state: ChatGraphState, over: Record<string, unknown> = {}) => {
    const sourceRegistry = createSourceRegistry();
    return seedAttachedDocuments({
      state,
      sourceRegistry,
      toolName: 'dokumente_lesen',
      isMounted: true,
      onInfo: () => {},
      onError: () => {},
      ...over,
    }).then((replay) => ({ replay, sourceRegistry }));
  };

  beforeEach(() => fanout.mockReset());

  it('trägt die Treffer zitierbar ein, aber nicht als frühere Recherche', async () => {
    fanout.mockResolvedValue({
      perSourceResults: { 'doc-1': [hit] },
      searchedCollections: [],
      errors: [],
    });

    const { sourceRegistry } = await run(stateWith());

    // `seedCarried` würde `prior` setzen — Ehrlichkeitshinweis „frühere
    // Recherche". Ein Dokument, das gerade hochgeladen wurde, ist keine
    // Alt-Recherche, also steht es in `size` und ist zitierbar.
    expect(sourceRegistry.size).toBe(1);
    expect(sourceRegistry.carriedSize).toBe(0);
  });

  /**
   * Der Vorab-Abruf ist nicht die Arbeit des Planers, und beide Wächter, die
   * gegen `freshSize` budgetieren, urteilen über genau die.
   *
   * `emptyResultFallback` erzwingt die Websuche, wenn die interne Suche lief
   * und leer blieb — mit den geseedeten Passagen im Zähler bliebe sie aus.
   * `checkSearchBudget` deckelt bei `MAX_SOURCES` (20): zwölf geseedete Chunks
   * nähmen 60 % weg, bevor der erste Aufruf läuft.
   */
  it('zählt nicht als Recherche des Planers', async () => {
    fanout.mockResolvedValue({
      perSourceResults: { 'doc-1': [hit] },
      searchedCollections: [],
      errors: [],
    });

    const { sourceRegistry } = await run(stateWith());

    expect(sourceRegistry.freshSize).toBe(0);
  });

  it('zählt ab dem Moment mit, in dem der Planer denselben Chunk selbst findet', async () => {
    fanout.mockResolvedValue({
      perSourceResults: { 'doc-1': [hit] },
      searchedCollections: [],
      errors: [],
    });

    const { sourceRegistry } = await run(stateWith());
    sourceRegistry.register([hit]);

    // Dieselbe Regel wie bei `prior`: wiedergefunden heisst gefunden — und
    // unter DERSELBEN Nummer, nicht als zweiter Chip.
    expect(sourceRegistry.freshSize).toBe(1);
    expect(sourceRegistry.size).toBe(1);
  });

  it('zeigt dem Planer den Abruf als Werkzeug-Paar', async () => {
    fanout.mockResolvedValue({
      perSourceResults: { 'doc-1': [hit] },
      searchedCollections: [],
      errors: [],
    });

    const { replay } = await run(stateWith());

    expect(replay).toHaveLength(2);
    expect(replay[0]?.role).toBe('assistant');
    expect(replay[1]?.role).toBe('tool');
    const call = (replay[0]?.content as { toolName: string; toolCallId: string }[])[0];
    const result = (replay[1]?.content as { toolCallId: string; output: { value: string } }[])[0];
    expect(call?.toolName).toBe('dokumente_lesen');
    // Aufruf und Ergebnis MÜSSEN dieselbe id tragen, sonst weist mistral-common
    // die Nachrichtenfolge ab.
    expect(result?.toolCallId).toBe(call?.toolCallId);
    expect(result?.output.value).toContain('Radverkehr wird ausgebaut.');
  });

  it('erdet den Schreiber auch dann, wenn das Werkzeug nicht montiert ist', async () => {
    fanout.mockResolvedValue({
      perSourceResults: { 'doc-1': [hit] },
      searchedCollections: [],
      errors: [],
    });

    const { replay, sourceRegistry } = await run(stateWith(), { isMounted: false });

    // Ohne Montage darf der Replay nicht auf ein Werkzeug zeigen, das es diesen
    // Turn nicht gibt — die Quellen bleiben trotzdem.
    expect(replay).toEqual([]);
    expect(sourceRegistry.size).toBe(1);
  });

  it('rührt einen Turn ohne angehängte Dokumente nicht an', async () => {
    const { replay, sourceRegistry } = await run(stateWith({ documentSources: [] }));

    expect(replay).toEqual([]);
    expect(sourceRegistry.size).toBe(0);
    expect(fanout).not.toHaveBeenCalled();
  });

  it('bleibt still, wenn der Abruf nichts findet', async () => {
    fanout.mockResolvedValue({ perSourceResults: {}, searchedCollections: [], errors: [] });

    const { replay, sourceRegistry } = await run(stateWith());

    expect(replay).toEqual([]);
    expect(sourceRegistry.size).toBe(0);
  });

  it('reisst den Turn nicht mit, wenn der Abruf scheitert', async () => {
    // Ein kaputtes Ergebnis statt eines geworfenen Fehlers: vitest rechnet einen
    // Wurf aus dem Mock dem Test zusätzlich als Fehlschlag an, auch wenn er
    // gefangen wird. Der Zweig ist derselbe — `Object.values(null)` wirft
    // innerhalb desselben try.
    fanout.mockResolvedValue({ perSourceResults: null });
    const onError = vi.fn();

    const { replay } = await run(stateWith(), { onError });

    expect(replay).toEqual([]);
    expect(onError).toHaveBeenCalledOnce();
  });
});
