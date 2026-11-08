/**
 * Der eine Vorab-Abruf für alles Material eines Loop-Turns (#5266). Er ruft die
 * drei Seeds je Leseweg und meldet EIN `delivered` — bis #5266 fehlten die
 * @link-Seiten darin, und ein Turn, dessen Seite schon gelesen war, bekam
 * trotzdem einen erzwungenen `named_intent`-Aufruf.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { seedTurnMaterial } from './catalogAssembly.js';
import { createSourceRegistry } from './sourceRegistry.js';

import type {
  ChatGraphState,
  DocumentSource,
} from '../../../../agents/langgraph/ChatGraph/types.js';

const fanout = vi.hoisted(() => vi.fn<(...a: unknown[]) => Promise<unknown>>());
vi.mock('../../../../agents/langgraph/ChatGraph/nodes/searchNode.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  executeMultiDocFanout: (...a: unknown[]) => fanout(...a),
}));
const crawl = vi.hoisted(() => vi.fn<(...a: unknown[]) => Promise<unknown>>());
vi.mock('../../../../services/search/index.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  crawlAndDistill: (...a: unknown[]) => crawl(...a),
}));
vi.mock('../../../../utils/validation/urlSecurity.js', () => ({
  validateUrlForFetch: async (raw: string) => ({ isValid: true, url: new URL(raw) }),
}));

const PAGE = 'https://example.org/radweg';
const doc: DocumentSource = { kind: 'document', id: 'doc-1', label: 'Satzung.pdf' };
const notebook: DocumentSource = { kind: 'notebook', id: 'nb-1', label: 'Haushalt' };
const wolke: DocumentSource = {
  kind: 'wolke',
  id: 'wolke:link-1:/Protokoll.docx',
  label: 'Protokoll.docx',
  wolke: { shareLinkId: 'link-1', path: '/Protokoll.docx', name: 'Protokoll.docx' },
};

const stateWith = (over: Record<string, unknown> = {}) =>
  ({
    intent: 'search',
    documentSources: [],
    attachedWebpageUrls: [],
    carriedWebpageUrls: [],
    searchQuery: 'Radweg',
    lastUserTextNoMentions: 'Was steht zum Radweg drin?',
    agentConfig: { userId: 'u1' },
    ...over,
  }) as unknown as ChatGraphState;

const run = (state: ChatGraphState, mounted: string[]) =>
  seedTurnMaterial({
    state,
    sourceRegistry: createSourceRegistry(),
    isMounted: (name) => mounted.includes(name),
    onInfo: () => {},
    onError: () => {},
  });

const toolNames = (replay: Awaited<ReturnType<typeof run>>['replay']) =>
  replay
    .filter((m) => m.role === 'assistant')
    .map((m) => (m.content as { toolName: string }[])[0]?.toolName);

describe('seedTurnMaterial', () => {
  beforeEach(() => {
    fanout.mockReset();
    fanout.mockImplementation(async (_query, sources) => ({
      perSourceResults: Object.fromEntries(
        (sources as DocumentSource[]).map((s) => [
          s.id,
          [{ source: s.id, title: s.label, content: `Inhalt aus ${s.label}`, relevance: 0.8 }],
        ])
      ),
      searchedCollections: [],
      errors: [],
    }));
    crawl.mockReset();
    crawl.mockImplementation(async (seeds) =>
      (seeds as { url: string }[]).map((s) => ({
        url: s.url,
        title: 'Radweg-Planung',
        content: 'Baubeginn ist im Frühjahr 2027.',
        crawled: true,
      }))
    );
  });

  it('meldet eine gelesene @link-Seite als geliefert', async () => {
    const seeded = await run(stateWith({ attachedWebpageUrls: [PAGE] }), ['scrape_url']);
    expect(seeded.delivered).toBe(true);
    expect(toolNames(seeded.replay)).toEqual(['scrape_url']);
  });

  it('liest Dokumente, Cloud-Dateien und Seiten in fester Reihenfolge', async () => {
    const seeded = await run(
      stateWith({ documentSources: [wolke, doc], attachedWebpageUrls: [PAGE] }),
      ['dokumente_lesen', 'cloud_files', 'scrape_url']
    );
    expect(seeded.delivered).toBe(true);
    expect(toolNames(seeded.replay)).toEqual(['dokumente_lesen', 'cloud_files', 'scrape_url']);
  });

  it('liefert nichts ohne Material', async () => {
    const seeded = await run(stateWith(), ['dokumente_lesen', 'cloud_files', 'scrape_url']);
    expect(seeded).toEqual({ replay: [], delivered: false, writerNote: '' });
    expect(fanout).not.toHaveBeenCalled();
  });

  // #5286: der Fehlertext im cloud_files-Replay erreicht nur den Planer.
  it('sagt dem Schreiber, welche Cloud-Datei nicht lesbar war — auch ohne cloud_files', async () => {
    fanout.mockResolvedValue({
      perSourceResults: { [wolke.id]: [] },
      searchedCollections: [],
      errors: [{ source: `wolke:${wolke.id}`, message: 'DNS lookup failed' }],
    });
    const seeded = await run(stateWith({ documentSources: [wolke] }), []);
    expect(seeded.delivered).toBe(false);
    expect(seeded.replay).toEqual([]);
    expect(seeded.writerNote).toContain('ANGEHÄNGTE DATEI NICHT LESBAR');
    expect(seeded.writerNote).toContain('„Protokoll.docx" (technischer Grund: DNS lookup failed)');
  });

  it('hat keine Notiz, wenn die Cloud-Datei gelesen wurde', async () => {
    const seeded = await run(stateWith({ documentSources: [wolke] }), ['cloud_files']);
    expect(seeded.delivered).toBe(true);
    expect(seeded.writerNote).toBe('');
  });

  // Phase 7 (08.11.2026): das gewählte Notebook kommt immer mit, nicht nur
  // auf einem Tabellen-Turn — der Loop beantwortet Notebook-Fragen jetzt selbst.
  it('nimmt das gewählte Notebook immer mit', async () => {
    await run(stateWith({ documentSources: [doc, notebook] }), ['dokumente_lesen']);
    expect((fanout.mock.calls[0]?.[1] as DocumentSource[]).map((s) => s.id)).toEqual([
      'doc-1',
      'nb-1',
    ]);
  });
});
