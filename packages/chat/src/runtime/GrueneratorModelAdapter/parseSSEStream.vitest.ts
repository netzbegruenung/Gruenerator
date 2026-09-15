import { describe, it, expect, vi } from 'vitest';

import { parseSSEStream } from './parseSSEStream';

import type { GrueneratorAdapterCallbacks, StreamOutcome, ToolCallPart } from './types';

const notifyWarning = vi.fn<(...args: unknown[]) => void>();
vi.mock('../../lib/notify', () => ({
  notifyWarning: (...args: unknown[]) => {
    notifyWarning(...args);
  },
  notifyError: vi.fn(),
}));

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

  it('accumulates gather_narration into progress.pendingNarration (S1 regression)', async () => {
    const outcome = { interrupted: false, indexedDocumentIds: [] as string[] };
    let last: { metadata: { custom: Record<string, unknown> } } | undefined;
    for await (const result of parseSSEStream(
      sseResponse([
        { event: 'intent', data: { intent: 'search', message: 'Suche läuft…' } },
        { event: 'gather_narration', data: { text: 'Ich durchsuche die Beschlüsse…' } },
        { event: 'gather_narration', data: { text: 'Jetzt prüfe ich das Wahlprogramm.' } },
      ]),
      callbacks,
      outcome
    )) {
      last = result as unknown as { metadata: { custom: Record<string, unknown> } };
    }
    const progress = last!.metadata.custom.progress as {
      message: string;
      pendingNarration?: string[];
    };
    // Both sentences accumulate (nothing lost); message keeps the latest so
    // Mobile's simple status field still shows something.
    expect(progress.pendingNarration).toEqual([
      'Ich durchsuche die Beschlüsse…',
      'Jetzt prüfe ich das Wahlprogramm.',
    ]);
    expect(progress.message).toBe('Jetzt prüfe ich das Wahlprogramm.');
  });

  it('stamps server-provided narration onto the tool card and clears the pending line', async () => {
    const content = await lastContent([
      { event: 'gather_narration', data: { text: 'Ich suche gleich.' } },
      {
        event: 'tool_step_start',
        data: {
          stepId: 's1',
          toolName: 'gruenerator_search',
          narration: 'Ich suche jetzt danach.',
        },
      },
    ]);
    const card = content.find(isCard);
    // Server value wins (survives reload); the client buffer is discarded.
    expect(card?.narration).toBe('Ich suche jetzt danach.');
  });

  it('falls back to draining buffered narration onto the card (old server, no field)', async () => {
    const content = await lastContent([
      { event: 'gather_narration', data: { text: 'Zuerst schaue ich' } },
      { event: 'gather_narration', data: { text: 'ins Parteiprogramm.' } },
      { event: 'tool_step_start', data: { stepId: 's1', toolName: 'gruenerator_search' } },
    ]);
    const card = content.find(isCard);
    expect(card?.narration).toBe('Zuerst schaue ich ins Parteiprogramm.');
  });

  it('drops trailing narration once synthesis text starts', async () => {
    const outcome = { interrupted: false, indexedDocumentIds: [] as string[] };
    let last: { metadata: { custom: Record<string, unknown> } } | undefined;
    for await (const result of parseSSEStream(
      sseResponse([
        { event: 'tool_step_start', data: { stepId: 's1', toolName: 'gruenerator_search' } },
        { event: 'gather_narration', data: { text: 'Fast fertig…' } },
        { event: 'text_delta', data: { text: 'Die Antwort lautet' } },
      ]),
      callbacks,
      outcome
    )) {
      last = result as unknown as { metadata: { custom: Record<string, unknown> } };
    }
    const progress = last!.metadata.custom.progress as { pendingNarration?: string[] };
    expect(progress.pendingNarration).toEqual([]);
  });
});

/**
 * The loop's image channel. `search_complete` — the event the single-pass path
 * uses — never arrives on a loop turn, so without this case the images the
 * backend now sends would land nowhere and the section would stay empty.
 */
describe('parseSSEStream search_images', () => {
  const image = {
    title: 'Windrad',
    url: 'https://example.test/wind.jpg',
    domain: 'example.test',
    proxyUrl: '/api/search-image?url=x&exp=1&sig=y',
  };

  async function lastMetadata(events: Array<{ event: string; data: unknown }>) {
    const outcome = { interrupted: false, indexedDocumentIds: [] as string[] };
    let last: { metadata?: { custom?: Record<string, unknown> } } | undefined;
    for await (const result of parseSSEStream(sseResponse(events), callbacks, outcome)) {
      last = result as typeof last;
    }
    return last?.metadata?.custom ?? {};
  }

  it('puts the images on custom.searchImages', async () => {
    const custom = await lastMetadata([
      { event: 'search_images', data: { images: [image] } },
      { event: 'text_delta', data: { text: 'Hier sind die Bilder.' } },
    ]);
    expect(custom.searchImages).toEqual([image]);
  });

  it('replaces on a second batch — the payload is the full list, not a delta', async () => {
    const second = { ...image, url: 'https://example.test/b.jpg' };
    const custom = await lastMetadata([
      { event: 'search_images', data: { images: [image] } },
      { event: 'search_images', data: { images: [image, second] } },
    ]);
    expect(custom.searchImages).toHaveLength(2);
  });

  /**
   * It arrives mid-loop while the model is still working — moving the progress
   * stage here would retire the running search's status line early.
   */
  it('leaves the progress stage alone', async () => {
    const outcome = { interrupted: false, indexedDocumentIds: [] as string[] };
    let last: { metadata?: { custom?: { progress?: { stage?: string } } } } | undefined;
    for await (const result of parseSSEStream(
      sseResponse([
        { event: 'search_start', data: { message: 'Suche…' } },
        { event: 'search_images', data: { images: [image] } },
      ]),
      callbacks,
      outcome
    )) {
      last = result as typeof last;
    }
    expect(last?.metadata?.custom?.progress?.stage).toBe('searching');
  });

  it('ignores an empty batch', async () => {
    const custom = await lastMetadata([{ event: 'search_images', data: { images: [] } }]);
    expect(custom.searchImages).toBeUndefined();
  });
});

describe('parseSSEStream reasoning across steps', () => {
  const reasoningOf = (content: ContentPart[]): string =>
    content.find((p): p is { type: 'reasoning'; text: string } => p.type === 'reasoning')?.text ??
    '';

  it('separates each step’s thinking with a blank line', async () => {
    const content = await lastContent([
      { event: 'reasoning_delta', data: { text: 'Erst den Text lesen.' } },
      { event: 'tool_step_start', data: { stepId: 's1', toolName: 'self_review' } },
      { event: 'tool_step_result', data: { stepId: 's1', toolName: 'self_review', ok: true } },
      { event: 'reasoning_delta', data: { text: 'Jetzt die Sätze kürzen.' } },
    ]);
    expect(reasoningOf(content)).toBe('Erst den Text lesen.\n\nJetzt die Sätze kürzen.');
  });

  it('keeps one step’s deltas glued together', async () => {
    const content = await lastContent([
      { event: 'reasoning_delta', data: { text: 'Der Satz ' } },
      { event: 'reasoning_delta', data: { text: 'ist zu lang.' } },
    ]);
    expect(reasoningOf(content)).toBe('Der Satz ist zu lang.');
  });

  it('opens a new block for the synth phase', async () => {
    const content = await lastContent([
      { event: 'reasoning_delta', data: { text: 'Planung.' } },
      { event: 'response_start', data: { message: 'Formuliere Antwort' } },
      { event: 'reasoning_delta', data: { text: 'Formulierung.' } },
    ]);
    expect(reasoningOf(content)).toBe('Planung.\n\nFormulierung.');
  });

  it('inserts no leading break when nothing has been thought yet', async () => {
    const content = await lastContent([
      { event: 'tool_step_start', data: { stepId: 's1', toolName: 'self_review' } },
      { event: 'reasoning_delta', data: { text: 'Erster Gedanke.' } },
    ]);
    expect(reasoningOf(content)).toBe('Erster Gedanke.');
  });
});

describe('parseSSEStream progress steps', () => {
  it('completes the retrieval step when its result lands', async () => {
    // The tracker labels itself from the STEP list, so a tool that only moved
    // `currentProgress` left "Suche läuft" shimmering over the whole answer.
    const outcome = { interrupted: false, indexedDocumentIds: [] as string[] };
    let last: { metadata?: { custom?: Record<string, unknown> } } | undefined;
    const events = [
      { event: 'text_delta', data: { text: 'Ich prüfe das.' } },
      { event: 'tool_step_start', data: { stepId: 's1', toolName: 'gruenerator_search' } },
      {
        event: 'tool_step_result',
        data: { stepId: 's1', toolName: 'gruenerator_search', ok: true },
      },
    ];
    for await (const result of parseSSEStream(sseResponse(events), callbacks, outcome)) {
      last = result as typeof last;
    }
    const progress = last?.metadata?.custom?.progress as {
      stage: string;
      steps: Array<{ stage: string; status: string }>;
    };
    expect(progress.stage).toBe('generating');
    expect(progress.steps.find((s) => s.stage === 'searching')?.status).toBe('completed');
    expect(progress.steps.find((s) => s.stage === 'generating')?.status).toBe('in-progress');
  });

  it('holds the step open while a parallel sibling is still running', async () => {
    // One model step may call two tools at once. The first result back must not
    // declare the retrieval finished while the second is still in flight.
    const outcome = { interrupted: false, indexedDocumentIds: [] as string[] };
    let last: { metadata?: { custom?: Record<string, unknown> } } | undefined;
    const events = [
      { event: 'tool_step_start', data: { stepId: 's1', toolName: 'gruenerator_search' } },
      { event: 'tool_step_start', data: { stepId: 's2', toolName: 'web_search' } },
      {
        event: 'tool_step_result',
        data: { stepId: 's1', toolName: 'gruenerator_search', ok: true },
      },
    ];
    for await (const result of parseSSEStream(sseResponse(events), callbacks, outcome)) {
      last = result as typeof last;
    }
    const progress = last?.metadata?.custom?.progress as {
      stage: string;
      steps: Array<{ stage: string; status: string }>;
    };
    expect(progress.stage).toBe('searching');
    expect(progress.steps.find((s) => s.stage === 'searching')?.status).toBe('in-progress');
    expect(progress.steps.some((s) => s.stage === 'generating')).toBe(false);
  });

  it('puts a pipeline after-step into the step list under its own title', async () => {
    // Die Nachschritte des Einfache-Sprache-Agenten laufen NACH dem Text und
    // minutenlang. Ihr Titel stand bis 14.08.2026 nur in `progress.message`,
    // den der Tracker nicht liest — auf dem Bildschirm blieb das Label von
    // Schritt 1 stehen. Beide Schritte teilen sich eine Stufe und
    // unterscheiden sich NUR im Titel; deshalb prüft der Test den zweiten.
    const outcome = { interrupted: false, indexedDocumentIds: [] as string[] };
    let last: { metadata?: { custom?: Record<string, unknown> } } | undefined;
    const step = (id: string, title: string, status: string) => ({
      event: 'progress_step',
      data: { stepId: id, toolName: 'gruenerator-einfache-sprache', title, status },
    });
    const events = [
      { event: 'text_delta', data: { text: 'Die Fassung.' } },
      step('es-rueck', 'Rückübersetzung wird erstellt', 'in_progress'),
      step('es-rueck', 'Rückübersetzung wird erstellt', 'in_progress'), // Heartbeat
      step('es-rueck', 'Rückübersetzung wird erstellt', 'completed'),
      step('es-pruefung', 'Prüfung läuft', 'in_progress'),
    ];
    for await (const result of parseSSEStream(sseResponse(events), callbacks, outcome)) {
      last = result as typeof last;
    }
    const progress = last?.metadata?.custom?.progress as {
      steps: Array<{ stage: string; label: string; status: string }>;
    };
    const active = progress.steps.filter((s) => s.status === 'in-progress');
    expect(active.map((s) => s.label)).toEqual(['Prüfung läuft']);
  });

  it('überschreibt das Label eines echten Suchschritts nicht', async () => {
    // Nachschritt und Such-Werkzeug teilen sich die Stufe `searching`. Ohne
    // eigene Identität übernähme der Titel des Nachschritts rückwirkend das
    // Label der Suche, und deren Herkunft wäre aus der fertigen Liste nicht
    // mehr ablesbar.
    const outcome = { interrupted: false, indexedDocumentIds: [] as string[] };
    let last: { metadata?: { custom?: Record<string, unknown> } } | undefined;
    const events = [
      { event: 'tool_step_start', data: { stepId: 's1', toolName: 'gruenerator_search' } },
      {
        event: 'tool_step_result',
        data: { stepId: 's1', toolName: 'gruenerator_search', ok: true, result: { count: 3 } },
      },
      { event: 'text_delta', data: { text: 'Die Fassung.' } },
      {
        event: 'progress_step',
        data: {
          stepId: 'es-pruefung',
          toolName: 'pipe',
          title: 'Prüfung läuft',
          status: 'in_progress',
        },
      },
    ];
    for await (const result of parseSSEStream(sseResponse(events), callbacks, outcome)) {
      last = result as typeof last;
    }
    const progress = last?.metadata?.custom?.progress as {
      steps: Array<{ stage: string; label: string; status: string }>;
    };
    // Zwei Einträge auf derselben Stufe: die Suche behält ihr eigenes Label
    // (hier „3 Ergebnisse" aus dem Werkzeug-Ergebnis), der Nachschritt bekommt
    // einen eigenen. Vor dem Schlüssel war es EIN Eintrag, und der trug am Ende
    // den Titel des Nachschritts.
    const suchend = progress.steps.filter((s) => s.stage === 'searching');
    expect(suchend).toHaveLength(2);
    expect(suchend[0]?.label).not.toBe('Prüfung läuft');
    expect(suchend[0]?.status).toBe('completed');
    expect(suchend[1]?.label).toBe('Prüfung läuft');
    expect(progress.steps.filter((s) => s.status === 'in-progress').map((s) => s.label)).toEqual([
      'Prüfung läuft',
    ]);
  });
});

describe('parseSSEStream tool approval', () => {
  it('baut aus dem Interrupt eine entscheidbare Karte MIT Dienst-Angabe', async () => {
    const outcome: StreamOutcome = { interrupted: false, indexedDocumentIds: [] };
    let last: { content: ContentPart[] } | undefined;
    const events = [
      {
        event: 'interrupt',
        data: {
          interruptType: 'tool_approval',
          approvalTurnId: 'turn-1',
          calls: [
            {
              toolCallId: 'c1',
              toolName: 'ma1b2c3d__send_message',
              args: { channel: '#allgemein', text: 'Hallo' },
              title: 'Slack · send_message',
              serverName: 'Slack',
            },
          ],
        },
      },
    ];
    for await (const result of parseSSEStream(sseResponse(events), callbacks, outcome)) {
      last = result as unknown as typeof last;
    }
    const card = (last?.content ?? []).filter(isCard)[0];
    expect(card?.approval?.id).toBe('c1');
    expect(card?.approval?.options?.length).toBeGreaterThan(0);
    // Der Grund für die Rückfrage: die Karte muss den Dienst nennen können.
    // Ohne diese beiden Felder zeigt sie nur `ma1b2c3d__send_message`.
    expect(card?.title).toBe('Slack · send_message');
    expect(card?.serverName).toBe('Slack');
    // Die vollen Übergabewerte, nicht nur `query` — wer freigibt, muss sehen,
    // was übergeben wird.
    expect(card?.args).toEqual({ channel: '#allgemein', text: 'Hallo' });
    expect(outcome.toolApprovalPending?.approvalTurnId).toBe('turn-1');
  });
});

/**
 * The notebook stream (`/notebook/stream`, reachable from /chat with a notebook
 * selected) ends on `completion`, never on `done` — so the trace id it carries
 * there is the only one this parser ever sees on that path. Without it the
 * thumbs feedback buttons stay hidden on notebook answers in the chat surface.
 */
describe('parseSSEStream notebook completion metadata', () => {
  const traceId = 'a'.repeat(32);

  async function lastMetadata(events: Array<{ event: string; data: unknown }>) {
    const outcome = { interrupted: false, indexedDocumentIds: [] as string[] };
    let last: { metadata?: { custom?: Record<string, unknown> } } | undefined;
    for await (const result of parseSSEStream(sseResponse(events), callbacks, outcome)) {
      last = result as typeof last;
    }
    return last?.metadata?.custom ?? {};
  }

  it('carries the completion trace id onto custom.streamMetadata', async () => {
    const custom = await lastMetadata([
      { event: 'text_delta', data: { text: 'Antwort' } },
      { event: 'completion', data: { text: 'Antwort', metadata: { traceId } } },
    ]);
    expect((custom.streamMetadata as { traceId?: string } | undefined)?.traceId).toBe(traceId);
  });

  it('leaves streamMetadata off a completion without a trace id', async () => {
    const custom = await lastMetadata([{ event: 'completion', data: { text: 'Antwort' } }]);
    expect(custom.streamMetadata).toBeUndefined();
  });
});

/**
 * `/chat?mode=notebook` and any reopened notebook thread route through this
 * parser (endpoints.notebookStream), not NotebookModelAdapter — so the
 * evidence_weak carve-out from that adapter's `warning` handling must hold
 * here too, or this path still toasts what Task 4 made quiet elsewhere.
 */
describe('parseSSEStream warning — evidence_weak', () => {
  const EVIDENCE_MESSAGE =
    'Zu dieser Frage habe ich im Notebook wenig Passendes gefunden — bitte die angegebenen Quellen prüfen.';

  async function lastCustom(events: Array<{ event: string; data: unknown }>) {
    const outcome = { interrupted: false, indexedDocumentIds: [] as string[] };
    let last: { metadata?: { custom?: Record<string, unknown> } } | undefined;
    for await (const result of parseSSEStream(sseResponse(events), callbacks, outcome)) {
      last = result as typeof last;
    }
    return last?.metadata?.custom ?? {};
  }

  it('carries evidence_weak on custom.evidenceWeak instead of toasting it', async () => {
    notifyWarning.mockClear();
    const custom = await lastCustom([
      { event: 'warning', data: { code: 'evidence_weak', message: EVIDENCE_MESSAGE } },
      { event: 'text_delta', data: { text: 'Dazu steht hier wenig.' } },
    ]);

    expect(custom.evidenceWeak).toBe(EVIDENCE_MESSAGE);
    expect(notifyWarning).not.toHaveBeenCalled();
  });

  it('still toasts every other warning code', async () => {
    notifyWarning.mockClear();
    const custom = await lastCustom([
      {
        event: 'warning',
        data: { code: 'search_degraded', message: 'Einige Quellen waren nicht erreichbar.' },
      },
      { event: 'text_delta', data: { text: 'Antwort.' } },
    ]);

    expect(notifyWarning).toHaveBeenCalledWith('Einige Quellen waren nicht erreichbar.');
    expect(custom.evidenceWeak).toBeUndefined();
  });
});
