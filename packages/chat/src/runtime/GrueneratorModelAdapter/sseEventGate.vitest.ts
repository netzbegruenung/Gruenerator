import {
  chatStreamEventSchemas,
  searchIntentSchema,
  sharepicVariantSchema,
} from '@gruenerator/contracts';
import { beforeEach, describe, it, expect } from 'vitest';

import { coerceSharepicVariants } from '../../hooks/useChatGraphStream';
import { useArtifactLiveStore, type ResearchLogArtifact } from '../../stores/artifactLiveStore';

import { parseSSEStream } from './parseSSEStream';

import type { GrueneratorAdapterCallbacks } from './types';

/**
 * The parser validates every known SSE event against
 * `chatStreamEventSchemas` before its switch. These tests pin the gate's
 * contract: real payloads pass (including unknown extra fields —
 * passthrough), malformed ones are rejected, and the sharepic canvasType
 * enum is enforced where it protects the live store / studio handoff.
 */
describe('chatStreamEventSchemas gate', () => {
  it('accepts a real sharepic_updated payload and keeps extra fields', () => {
    const schema = chatStreamEventSchemas['sharepic_updated'];
    const result = schema!.safeParse({
      variantId: 'v1',
      canvasId: 'c1',
      version: 2,
      canvasType: 'dreizeilen',
      state: { line1: 'Hallo' },
      summary: 'Zeile gekürzt',
      futureField: 'kept',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).futureField).toBe('kept');
    }
  });

  it('rejects sharepic_updated with a non-canonical canvasType', () => {
    const result = chatStreamEventSchemas['sharepic_updated']!.safeParse({
      variantId: 'v1',
      canvasId: 'c1',
      version: 2,
      canvasType: 'not-a-template',
      summary: 'x',
    });
    expect(result.success).toBe(false);
  });

  it('accepts every backend intent value on the intent event', () => {
    const schema = chatStreamEventSchemas['intent']!;
    for (const intent of searchIntentSchema.options) {
      const parsed = schema.safeParse({ intent, message: 'Los...' });
      expect(parsed.success).toBe(true);
      if (parsed.success) expect((parsed.data as { intent: string }).intent).toBe(intent);
    }
  });

  it('degrades an unknown intent to `direct` instead of dropping the event', () => {
    // A rejected event is DROPPED whole by the parser, so a backend that emits
    // an intent added after this bundle shipped would lose the entire progress
    // transition — the exact position every deployed mobile binary is in the
    // moment an intent is added. `direct` is the neutral degradation: it maps
    // to the "generating" stage and has no INTENT_TO_TOOL entry, so no ghost
    // tool card appears.
    const schema = chatStreamEventSchemas['intent']!;
    const parsed = schema.safeParse({ intent: 'intent_from_the_future', message: 'x' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect((parsed.data as { intent: string }).intent).toBe('direct');
      expect((parsed.data as { message: string }).message).toBe('x');
    }
  });

  it('rejects text_delta without text but accepts extra fields', () => {
    const schema = chatStreamEventSchemas['text_delta']!;
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ text: 'hi', seq: 4 }).success).toBe(true);
  });

  it('done stays loose: everything optional, unknown fields survive', () => {
    const schema = chatStreamEventSchemas['done']!;
    const result = schema.safeParse({
      threadId: 't1',
      citations: [],
      boardId: 'b1',
      boardGeneratedStructure: { rows: [] },
      metadata: { intent: 'direct', searchCount: 0 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).boardId).toBe('b1');
    }
    expect(schema.safeParse({}).success).toBe(true);
  });

  it('social_post_updated requires the full post payload', () => {
    const schema = chatStreamEventSchemas['social_post_updated']!;
    expect(
      schema.safeParse({
        postId: 'p1',
        summary: 'kürzer',
        post: {
          postId: 'p1',
          platform: 'instagram',
          text: 'Hallo #Gruen',
          hashtags: ['#Gruen'],
          charCount: 12,
          version: 2,
        },
      }).success
    ).toBe(true);
    expect(schema.safeParse({ postId: 'p1', summary: 'kürzer' }).success).toBe(false);
  });

  it('accepts a real gather_narration payload and keeps extra fields', () => {
    const schema = chatStreamEventSchemas['gather_narration']!;
    const result = schema.safeParse({ text: 'Ich suche jetzt …', futureField: 'kept' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).futureField).toBe('kept');
    }
  });

  it('rejects gather_narration without text or with a non-string text', () => {
    const schema = chatStreamEventSchemas['gather_narration']!;
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ text: 42 }).success).toBe(false);
  });

  it('tool_step_start accepts optional narration and stays valid without it (back-compat)', () => {
    const schema = chatStreamEventSchemas['tool_step_start']!;
    // Old payload (no narration) still validates.
    expect(schema.safeParse({ stepId: 's1', toolName: 'gruenerator_search' }).success).toBe(true);
    // New payload with narration validates and keeps the field.
    const withNarration = schema.safeParse({
      stepId: 's1',
      toolName: 'gruenerator_search',
      narration: 'Ich suche jetzt danach.',
    });
    expect(withNarration.success).toBe(true);
    if (withNarration.success) {
      expect((withNarration.data as Record<string, unknown>).narration).toBe(
        'Ich suche jetzt danach.'
      );
    }
  });

  it('reel_updated pins the segment shape', () => {
    const schema = chatStreamEventSchemas['reel_updated']!;
    const base = { projectId: 'p', title: 't', summary: 's', changedIndices: [0] };
    expect(
      schema.safeParse({
        ...base,
        segments: [{ id: 1, startTime: 0, endTime: 2.5, text: 'Hi' }],
      }).success
    ).toBe(true);
    expect(schema.safeParse({ ...base, segments: [{ id: 'x', startTime: 'bad' }] }).success).toBe(
      false
    );
  });
});

describe('coerceSharepicVariants (schema-based)', () => {
  it('keeps valid variants and drops malformed ones individually', () => {
    const result = coerceSharepicVariants([
      { id: 'v1', canvasType: 'dreizeilen', initialProps: { line1: 'a' } },
      { id: 'v2', canvasType: 'junk-type', initialProps: {} },
      { id: 'v3', canvasType: 'info', initialProps: null },
    ]);
    expect(result?.map((v) => v.id)).toEqual(['v1']);
  });

  it('returns null for non-arrays and empty results', () => {
    expect(coerceSharepicVariants('nope')).toBe(null);
    expect(coerceSharepicVariants([{ id: 1 }])).toBe(null);
  });

  it('sharepicVariantSchema keeps deck pages and passthrough fields', () => {
    const parsed = sharepicVariantSchema.safeParse({
      id: 'd1',
      canvasType: 'slider',
      initialProps: {},
      canvasId: 'c9',
      pages: [{ headline: 'A' }, { headline: 'B' }],
      newField: true,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.pages?.length).toBe(2);
      expect((parsed.data as Record<string, unknown>).newField).toBe(true);
    }
  });
});

describe('parseSSEStream gather_narration handling', () => {
  function sseResponse(events: Array<{ event: string; data: unknown }>): Response {
    const body = events
      .map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      .join('');
    return new Response(body);
  }

  const callbacks: GrueneratorAdapterCallbacks = {};

  it('sets custom.progress.message and accumulates pendingNarration', async () => {
    const response = sseResponse([
      { event: 'intent', data: { intent: 'search', message: 'Suche läuft…' } },
      { event: 'gather_narration', data: { text: 'Ich durchsuche gerade die Beschlüsse…' } },
    ]);
    const outcome = { interrupted: false, indexedDocumentIds: [] as string[] };

    let last: unknown;
    for await (const result of parseSSEStream(response, callbacks, outcome)) {
      last = result;
    }

    const custom = (last as { metadata: { custom: Record<string, unknown> } }).metadata.custom as {
      progress: { message: string; pendingNarration?: string[] };
    };
    expect(custom.progress.message).toBe('Ich durchsuche gerade die Beschlüsse…');
    expect(custom.progress.pendingNarration).toEqual(['Ich durchsuche gerade die Beschlüsse…']);
  });

  it('drops a malformed gather_narration event before it reaches the switch', async () => {
    const response = sseResponse([
      { event: 'intent', data: { intent: 'search', message: 'Suche läuft…' } },
      { event: 'gather_narration', data: {} },
    ]);
    const outcome = { interrupted: false, indexedDocumentIds: [] as string[] };

    let last: unknown;
    for await (const result of parseSSEStream(response, callbacks, outcome)) {
      last = result;
    }

    const custom = (last as { metadata: { custom: Record<string, unknown> } }).metadata.custom as {
      progress: { message: string };
    };
    expect(custom.progress.message).toBe('Suche läuft…');
  });
});

/**
 * The research log is the one artifact the backend keeps writing to after it
 * opens: one `research_log_start`, then dozens of `research_log_update`s over
 * several minutes. The parser is what turns those into store state, and a
 * dropped or misrouted update leaves the panel frozen on a run that is very
 * much alive — the exact failure the panel exists to prevent.
 */
describe('parseSSEStream research_log handling', () => {
  function sseResponse(events: Array<{ event: string; data: unknown }>): Response {
    const body = events
      .map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      .join('');
    return new Response(body);
  }

  const callbacks: GrueneratorAdapterCallbacks = {};

  async function drain(response: Response): Promise<void> {
    const outcome = { interrupted: false, indexedDocumentIds: [] as string[] };
    for await (const _ of parseSSEStream(response, callbacks, outcome)) {
      // The research log lands in the store, not in the yielded result.
    }
  }

  function activeLog(): ResearchLogArtifact {
    const active = useArtifactLiveStore.getState().activeArtifact;
    if (!active || active.type !== 'research_log') throw new Error('no research log active');
    return active;
  }

  beforeEach(() => {
    useArtifactLiveStore.setState({ activeArtifact: null });
  });

  it('opens the panel on start, before any progress exists', async () => {
    await drain(
      sseResponse([
        { event: 'research_log_start', data: { id: 'research-1', title: 'Recherche: Wien' } },
      ])
    );

    const log = activeLog();
    expect(log.id).toBe('research-1');
    expect(log.title).toBe('Recherche: Wien');
    expect(log.status).toBe('running');
    expect(log.plan).toEqual([]);
  });

  it('merges plan and steps from later updates into the open log', async () => {
    await drain(
      sseResponse([
        { event: 'research_log_start', data: { id: 'research-1', title: 'Recherche: Wien' } },
        {
          event: 'research_log_update',
          data: { id: 'research-1', plan: [{ id: 'p0', label: 'Zahlen', status: 'running' }] },
        },
        {
          event: 'research_log_update',
          data: { id: 'research-1', steps: [{ id: 's0', label: 'Suche', status: 'running' }] },
        },
        {
          event: 'research_log_update',
          data: { id: 'research-1', steps: [{ id: 's0', label: 'Suche', status: 'done' }] },
        },
      ])
    );

    const log = activeLog();
    expect(log.plan.map((p) => p.label)).toEqual(['Zahlen']);
    // One step, updated in place — not the same step twice.
    expect(log.steps).toHaveLength(1);
    expect(log.steps[0]?.status).toBe('done');
  });

  it('carries the document link through on the closing update', async () => {
    await drain(
      sseResponse([
        { event: 'research_log_start', data: { id: 'research-1', title: 'Recherche' } },
        {
          event: 'research_log_update',
          data: { id: 'research-1', status: 'done', documentUrl: '/office/abc', documentId: 'abc' },
        },
      ])
    );

    const log = activeLog();
    expect(log.status).toBe('done');
    expect(log.documentUrl).toBe('/office/abc');
  });

  it('ignores an update for a different run, so a stale log is never overwritten', async () => {
    await drain(
      sseResponse([
        { event: 'research_log_start', data: { id: 'research-1', title: 'Recherche' } },
        {
          event: 'research_log_update',
          data: { id: 'research-2', status: 'failed' },
        },
      ])
    );

    expect(activeLog().status).toBe('running');
  });

  it('drops a start event without an id instead of opening an unaddressable panel', async () => {
    await drain(sseResponse([{ event: 'research_log_start', data: { title: 'Recherche' } }]));

    expect(useArtifactLiveStore.getState().activeArtifact).toBeNull();
  });
});
