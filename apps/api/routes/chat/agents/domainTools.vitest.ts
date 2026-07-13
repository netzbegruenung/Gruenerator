import { describe, it, expect, vi, beforeEach } from 'vitest';

import { createSourceRegistry } from '../services/agenticLoop/sourceRegistry.js';

import {
  makeAbgeordnetenwatchTool,
  makeBundestagTool,
  makeImageTool,
  makeSummaryTool,
} from './domainTools.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';

const searchNode = vi.fn<(s: unknown) => Promise<unknown>>();
const summarizeNode = vi.fn<(s: unknown) => Promise<unknown>>();
const imageNode = vi.fn<(s: unknown) => Promise<unknown>>();
vi.mock('../../../agents/langgraph/ChatGraph/nodes/searchNode.js', () => ({
  searchNode: (s: unknown): Promise<unknown> => searchNode(s),
}));
vi.mock('../../../agents/langgraph/ChatGraph/nodes/summarizeNode.js', () => ({
  summarizeNode: (s: unknown): Promise<unknown> => summarizeNode(s),
}));
vi.mock('../../../agents/langgraph/ChatGraph/nodes/imageNode.js', () => ({
  imageNode: (s: unknown): Promise<unknown> => imageNode(s),
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

describe('makeImageTool', () => {
  beforeEach(() => imageNode.mockReset());

  it('injects the prompt, emits image events, returns lean confirmation, and merges the image onto state', async () => {
    const image = {
      base64: 'data:image/jpeg;base64,AAA',
      url: '/uploads/flux/results/x.jpg',
      filename: 'x.jpg',
      prompt: 'Windrad im Sonnenlicht',
      style: 'illustration',
      generationTimeMs: 900,
    };
    imageNode.mockResolvedValue({ generatedImage: image });
    const events: SseEvent[] = [];
    const state = {
      ...baseState,
      intent: 'image',
      messages: [{ role: 'user', content: 'egal' }],
    } as unknown as ChatGraphState;
    const out = (await exec(makeImageTool({ sse: fakeSse(events), state }), {
      prompt: 'Windrad im Sonnenlicht',
    })) as { ok?: boolean; prompt?: string };
    expect(out.ok).toBe(true);
    expect(out.prompt).toBe('Windrad im Sonnenlicht');
    expect(events.map((e) => e.type)).toEqual(['image_start', 'image_complete']);
    // Full image (incl. base64) rides the image_complete event for the live card.
    expect((events[1].payload as { image: { base64: string } }).image.base64).toBe(image.base64);
    // Merged onto shared state so the router can persist it.
    expect((state as unknown as { generatedImage: unknown }).generatedImage).toBe(image);
    // The model's prompt was injected as the trailing user message imageNode reads.
    const passedState = imageNode.mock.calls[0][0] as { messages: { content: string }[] };
    expect(passedState.messages.at(-1)?.content).toBe('Windrad im Sonnenlicht');
  });

  it('is idempotent per turn: a second call does not regenerate (protects the image quota)', async () => {
    const image = {
      base64: 'x',
      url: '/u.jpg',
      filename: 'u.jpg',
      prompt: 'p',
      style: 'realistic',
      generationTimeMs: 1,
    };
    imageNode.mockResolvedValue({ generatedImage: image });
    const events: SseEvent[] = [];
    const state = {
      ...baseState,
      intent: 'image',
      messages: [{ role: 'user', content: 'x' }],
    } as unknown as ChatGraphState;
    const tool = makeImageTool({ sse: fakeSse(events), state });
    await exec(tool, { prompt: 'Windrad' });
    const second = (await exec(tool, { prompt: 'Windrad nochmal' })) as { ok?: boolean };
    expect(second.ok).toBe(true);
    expect(imageNode).toHaveBeenCalledTimes(1); // ← not 2: no second FLUX call / quota burn
    // Only the first call emits image events.
    expect(events.filter((e) => e.type === 'image_start')).toHaveLength(1);
  });

  it('returns an error result (and clears state image) when generation fails', async () => {
    imageNode.mockResolvedValue({ generatedImage: null, error: 'Tageslimit erreicht.' });
    const events: SseEvent[] = [];
    const state = {
      ...baseState,
      intent: 'image',
      messages: [{ role: 'user', content: 'x' }],
    } as unknown as ChatGraphState;
    const out = (await exec(makeImageTool({ sse: fakeSse(events), state }), {
      prompt: 'irgendwas',
    })) as { error?: string; ok?: boolean };
    expect(out.error).toBe('Tageslimit erreicht.');
    expect(out.ok).toBeUndefined();
    expect((state as unknown as { generatedImage: unknown }).generatedImage).toBeNull();
    // image_complete still fires so the progress indicator resolves.
    expect(events.map((e) => e.type)).toEqual(['image_start', 'image_complete']);
  });
});
