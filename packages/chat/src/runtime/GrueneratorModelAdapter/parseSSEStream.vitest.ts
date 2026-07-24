import { describe, it, expect } from 'vitest';

import { parseSSEStream } from './parseSSEStream';
import type { GrueneratorAdapterCallbacks, ToolCallPart } from './types';

/**
 * Stufe 2 (Interleaving): text_delta and tool_step_* cards must render in true
 * event order (text→card→text), live and — via textOffset — after reload. These
 * tests drive real SSE Response objects through the parser (same pattern as
 * sseEventGate.vitest.ts) and assert the ordered content the parser yields.
 */

function sseResponse(events: Array<{ event: string; data: unknown }>): Response {
  const body = events
    .map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    .join('');
  return new Response(body);
}

const callbacks: GrueneratorAdapterCallbacks = {};

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | ({ type: 'tool-call' } & ToolCallPart)
  | { type: 'source' };

async function lastContent(
  events: Array<{ event: string; data: unknown }>
): Promise<ContentPart[]> {
  const outcome = { interrupted: false, indexedDocumentIds: [] as string[] };
  let last: { content: ContentPart[] } | undefined;
  for await (const result of parseSSEStream(sseResponse(events), callbacks, outcome)) {
    last = result as unknown as { content: ContentPart[] };
  }
  return last?.content ?? [];
}

const isText = (p: ContentPart): p is { type: 'text'; text: string } => p.type === 'text';
const isCard = (p: ContentPart): p is { type: 'tool-call' } & ToolCallPart =>
  p.type === 'tool-call';

describe('parseSSEStream interleaving', () => {
  it('renders text→tool→text as two text segments with the card between, in order', async () => {
    const content = await lastContent([
      { event: 'text_delta', data: { text: 'Hallo ' } },
      { event: 'tool_step_start', data: { stepId: 's1', toolName: 'gruenerator_search' } },
      {
        event: 'tool_step_result',
        data: { stepId: 's1', toolName: 'gruenerator_search', ok: true },
      },
      { event: 'text_delta', data: { text: 'Welt' } },
    ]);

    const shapes = content.map((p) => p.type);
    expect(shapes).toEqual(['text', 'tool-call', 'text']);
    expect((content[0] as { text: string }).text).toBe('Hallo ');
    expect((content[2] as { text: string }).text).toBe('Welt');
  });

  it('updates the card in orderedContent on tool_step_result (replace case)', async () => {
    const content = await lastContent([
      { event: 'tool_step_start', data: { stepId: 's1', toolName: 'gruenerator_search' } },
      {
        event: 'tool_step_result',
        data: {
          stepId: 's1',
          toolName: 'gruenerator_search',
          ok: true,
          result: { results: [{ title: 'A' }, { title: 'B' }] },
        },
      },
    ]);

    const card = content.find(isCard);
    expect(card).toBeDefined();
    // tool_step_result REPLACES the card object; the update must land in
    // orderedContent, not stay on the pre-result card.
    expect((card!.result as { ok?: boolean }).ok).toBe(true);
    expect((card!.result as { results?: unknown[] }).results).toHaveLength(2);
  });

  it('shares parentId for back-to-back cards; a card after text starts a new run', async () => {
    const content = await lastContent([
      { event: 'tool_step_start', data: { stepId: 's1', toolName: 'gruenerator_search' } },
      { event: 'tool_step_start', data: { stepId: 's2', toolName: 'web_search' } },
      { event: 'text_delta', data: { text: 'Zwischentext' } },
      { event: 'tool_step_start', data: { stepId: 's3', toolName: 'gruenerator_search' } },
    ]);

    const cards = content.filter(isCard);
    expect(cards.map((c) => c.toolCallId)).toEqual(['s1', 's2', 's3']);
    // s1 & s2 are one contiguous run → share s1's parentId.
    expect(cards[0].parentId).toBe('s1');
    expect(cards[1].parentId).toBe('s1');
    // s3 follows a text segment → new run, own toolCallId.
    expect(cards[2].parentId).toBe('s3');
  });

  it('completion replaces all text segments with one at the end, keeping cards', async () => {
    const content = await lastContent([
      { event: 'text_delta', data: { text: 'roh a' } },
      { event: 'tool_step_start', data: { stepId: 's1', toolName: 'gruenerator_search' } },
      { event: 'text_delta', data: { text: 'roh b' } },
      { event: 'completion', data: { text: 'Finaler Text' } },
    ]);

    expect(content.map((p) => p.type)).toEqual(['tool-call', 'text']);
    const text = content.filter(isText);
    expect(text).toHaveLength(1);
    expect(text[0].text).toBe('Finaler Text');
  });

  it('normalizes [cite:N] → [N] per text segment', async () => {
    const content = await lastContent([
      { event: 'text_delta', data: { text: 'Siehe [cite:1] ' } },
      { event: 'tool_step_start', data: { stepId: 's1', toolName: 'gruenerator_search' } },
      { event: 'text_delta', data: { text: 'und [cite:2].' } },
    ]);

    const texts = content.filter(isText).map((t) => t.text);
    expect(texts).toEqual(['Siehe [1] ', 'und [2].']);
  });

  it('still handles the gather_narration case (S1 regression)', async () => {
    const outcome = { interrupted: false, indexedDocumentIds: [] as string[] };
    let last: { metadata: { custom: Record<string, unknown> } } | undefined;
    for await (const result of parseSSEStream(
      sseResponse([
        { event: 'intent', data: { intent: 'search', message: 'Suche läuft…' } },
        { event: 'gather_narration', data: { text: 'Ich durchsuche die Beschlüsse…' } },
      ]),
      callbacks,
      outcome
    )) {
      last = result as unknown as { metadata: { custom: Record<string, unknown> } };
    }
    const progress = last!.metadata.custom.progress as {
      message: string;
      steps: Array<{ status: string; label: string }>;
    };
    expect(progress.message).toBe('Ich durchsuche die Beschlüsse…');
    expect(progress.steps.find((s) => s.status === 'in-progress')?.label).toBe(
      'Ich durchsuche die Beschlüsse…'
    );
  });
});
