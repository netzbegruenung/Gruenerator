import { describe, it, expect, vi, beforeEach } from 'vitest';

import { createSourceRegistry } from '../services/agenticLoop/sourceRegistry.js';

import { makeAbgeordnetenwatchTool, makeBundestagTool, makeSummaryTool } from './domainTools.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';

const searchNode = vi.fn<(s: unknown) => Promise<unknown>>();
const summarizeNode = vi.fn<(s: unknown) => Promise<unknown>>();
vi.mock('../../../agents/langgraph/ChatGraph/nodes/searchNode.js', () => ({
  searchNode: (s: unknown): Promise<unknown> => searchNode(s),
}));
vi.mock('../../../agents/langgraph/ChatGraph/nodes/summarizeNode.js', () => ({
  summarizeNode: (s: unknown): Promise<unknown> => summarizeNode(s),
}));

type SseEvent = { type: string; payload: unknown };
function fakeSse(sink: SseEvent[]) {
  return {
    send: (type: string, payload: unknown) => sink.push({ type, payload }),
  } as unknown as Parameters<typeof makeSummaryTool>[0]['sse'];
}

const baseState = {
  intent: 'search',
  searchQuery: null,
  documentIds: [],
  documentChatIds: [],
} as unknown as ChatGraphState;

function exec(tool: unknown, input: unknown) {
  return (tool as { execute: (i: unknown, o: { toolCallId: string }) => Promise<unknown> }).execute(
    input,
    { toolCallId: 'c1' }
  );
}

describe('makeSummaryTool', () => {
  beforeEach(() => summarizeNode.mockReset());

  it('emits summary_start/summary_complete and returns the digest', async () => {
    summarizeNode.mockResolvedValue({ summaryContext: 'Kurzfassung.', summaryTimeMs: 1200 });
    const events: SseEvent[] = [];
    const state = {
      ...baseState,
      intent: 'summary',
      documentIds: ['d1', 'd2'],
      documentChatIds: ['dc1'],
    } as unknown as ChatGraphState;
    const out = (await exec(makeSummaryTool({ sse: fakeSse(events), state }), {})) as {
      summary?: string;
    };
    expect(out.summary).toBe('Kurzfassung.');
    expect(events.map((e) => e.type)).toEqual(['summary_start', 'summary_complete']);
    expect((events[0].payload as { documentCount: number }).documentCount).toBe(3);
    expect((events[1].payload as { summaryLength: number }).summaryLength).toBe(
      'Kurzfassung.'.length
    );
  });

  it('returns an error result when nothing could be summarized', async () => {
    summarizeNode.mockResolvedValue({ summaryContext: '', summaryTimeMs: 5 });
    const events: SseEvent[] = [];
    const out = (await exec(
      makeSummaryTool({
        sse: fakeSse(events),
        state: { ...baseState, intent: 'summary' } as ChatGraphState,
      }),
      {}
    )) as { error?: string; summary?: string };
    expect(out.error).toBeTruthy();
    expect(out.summary).toBeUndefined();
    // summary_complete still fires so the progress indicator resolves.
    expect(events.map((e) => e.type)).toEqual(['summary_start', 'summary_complete']);
  });
});

describe('makeBundestagTool', () => {
  beforeEach(() => searchNode.mockReset());

  it('emits the bundestag event, registers sources, and returns the payload verbatim', async () => {
    const payload = { kind: 'topic', notes: ['Treffer'], metadata: { query: 'Klima' } };
    searchNode.mockResolvedValue({
      bundestagResult: payload,
      searchResults: [
        {
          source: 'bundestag',
          url: 'https://dip.bundestag.de/x',
          title: 'Drucksache',
          content: 'Text zur Klimapolitik.',
        },
      ],
    });
    const events: SseEvent[] = [];
    const sourceRegistry = createSourceRegistry();
    const out = await exec(
      makeBundestagTool({
        sse: fakeSse(events),
        state: { ...baseState, intent: 'bundestag' } as ChatGraphState,
        sourceRegistry,
      }),
      { query: 'Klima' }
    );
    expect(out).toBe(payload);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('bundestag');
    expect((events[0].payload as { bundestag: unknown }).bundestag).toBe(payload);
    expect(sourceRegistry.size).toBe(1);
    // searchNode was routed with the bundestag intent + the model's query.
    expect(searchNode).toHaveBeenCalledWith(
      expect.objectContaining({ intent: 'bundestag', searchQuery: 'Klima' })
    );
  });

  it('returns a note (no event) when there is no structured payload (e.g. de-AT decline)', async () => {
    searchNode.mockResolvedValue({
      bundestagResult: null,
      searchResults: [{ source: 'bundestag', url: '', title: '', content: 'Nur für Deutschland.' }],
    });
    const events: SseEvent[] = [];
    const out = (await exec(
      makeBundestagTool({
        sse: fakeSse(events),
        state: { ...baseState, intent: 'bundestag' } as ChatGraphState,
        sourceRegistry: createSourceRegistry(),
      }),
      { query: 'x' }
    )) as { note?: string };
    expect(out.note).toBe('Nur für Deutschland.');
    expect(events).toHaveLength(0);
  });
});

describe('makeAbgeordnetenwatchTool', () => {
  beforeEach(() => searchNode.mockReset());

  it('registers results and returns the lean sources shape', async () => {
    searchNode.mockResolvedValue({
      searchResults: [
        {
          source: 'abgeordnetenwatch',
          url: 'https://aw.de/p',
          title: 'Profil',
          content: 'Stimmte dafür.',
        },
      ],
    });
    const sourceRegistry = createSourceRegistry();
    const out = (await exec(
      makeAbgeordnetenwatchTool({
        state: { ...baseState, intent: 'abgeordnetenwatch' } as ChatGraphState,
        sourceRegistry,
      }),
      { query: 'Habeck' }
    )) as { resultCount: number; sources: string };
    expect(out.resultCount).toBe(1);
    expect(out.sources).toContain('[1]');
    expect(sourceRegistry.size).toBe(1);
    expect(searchNode).toHaveBeenCalledWith(
      expect.objectContaining({ intent: 'abgeordnetenwatch', searchQuery: 'Habeck' })
    );
  });

  it('returns an error result when there are no results', async () => {
    searchNode.mockResolvedValue({ searchResults: [] });
    const out = (await exec(
      makeAbgeordnetenwatchTool({
        state: { ...baseState, intent: 'abgeordnetenwatch' } as ChatGraphState,
        sourceRegistry: createSourceRegistry(),
      }),
      { query: 'niemand' }
    )) as { error?: string; resultCount: number };
    expect(out.error).toBeTruthy();
    expect(out.resultCount).toBe(0);
  });
});
