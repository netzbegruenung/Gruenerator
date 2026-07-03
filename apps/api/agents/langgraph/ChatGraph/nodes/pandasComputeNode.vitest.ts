import { describe, expect, it, vi } from 'vitest';

import {
  pandasComputeNode,
  parseCodegenResponse,
  truncateTableContext,
} from './pandasComputeNode.js';

import type { ChatGraphState } from '../types.js';

vi.mock('../../../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

// The real module drags in OCRService/env config — irrelevant for this unit.
vi.mock('../../../../routes/chat/services/attachmentProcessingService.js', () => ({
  isTabularAttachment: (name: string) =>
    name.endsWith('.csv') || name.endsWith('.xlsx') || name.endsWith('.xls'),
}));

function makeState(llmContent: string, overrides: Partial<ChatGraphState> = {}): ChatGraphState {
  return {
    messages: [{ role: 'user', content: 'wie hoch ist der gesamtgewinn?' }],
    searchQuery: null,
    threadAttachments: [
      {
        id: 'a1',
        name: 'umsatz.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        isImage: false,
        extractedText: 'Region | Umsatz | Gewinn\nNord | 100 | 20',
        documentId: null,
        summary: null,
        createdAt: new Date(),
      },
    ],
    attachmentContext: null,
    aiWorkerPool: {
      processRequest: vi.fn().mockResolvedValue({ content: llmContent }),
    },
    ...overrides,
  } as unknown as ChatGraphState;
}

describe('parseCodegenResponse', () => {
  it('parses the JSON-mode shape', () => {
    expect(parseCodegenResponse('{"related": true, "code": "print(1)"}')).toEqual({
      related: true,
      code: 'print(1)',
    });
  });

  it('parses the unrelated JSON shape', () => {
    expect(parseCodegenResponse('{"related": false, "code": ""}')).toEqual({
      related: false,
      code: '',
    });
  });

  it('parses JSON wrapped in a markdown fence', () => {
    expect(parseCodegenResponse('```json\n{"related": true, "code": "print(2)"}\n```')).toEqual({
      related: true,
      code: 'print(2)',
    });
  });

  it('falls back to raw code when the provider dropped JSON mode', () => {
    expect(parseCodegenResponse('print("Gesamtgewinn:", df["Gewinn"].sum())')).toEqual({
      related: true,
      code: 'print("Gesamtgewinn:", df["Gewinn"].sum())',
    });
    expect(parseCodegenResponse('```python\nprint(3)\n```')).toEqual({
      related: true,
      code: 'print(3)',
    });
  });

  it('recognizes the raw UNRELATED sentinel in fallback mode', () => {
    expect(parseCodegenResponse('UNRELATED')).toEqual({ related: false, code: '' });
  });
});

describe('truncateTableContext', () => {
  it('returns short table text unchanged', () => {
    const text = 'Region | Umsatz\nNord | 100\nGESAMT | 100';
    expect(truncateTableContext(text)).toBe(text);
  });

  it('keeps head AND tail of oversized tables (GESAMT rows live at the end)', () => {
    const rows = Array.from({ length: 800 }, (_, i) => `Zeile${i} | ${i * 10}`);
    rows.push('GESAMT | 999999');
    const text = rows.join('\n');
    const cut = truncateTableContext(text);

    expect(cut.length).toBeLessThan(text.length);
    expect(cut).toContain('Zeile0 | 0');
    // The load-bearing end of the table survives the cut.
    expect(cut).toContain('GESAMT | 999999');
    // Cut on line boundaries: the marker sits between complete lines.
    expect(cut).toContain('\n... [Tabelle gekürzt] ...\n');
  });
});

describe('pandasComputeNode', () => {
  it('returns generated code and asks the LLM with the raw user question + table context', async () => {
    const state = makeState('{"related": true, "code": "print(\\"Gesamtgewinn:\\", 42)"}');
    const { pythonCode } = await pandasComputeNode(state);
    expect(pythonCode).toBe('print("Gesamtgewinn:", 42)');

    const call = (state.aiWorkerPool as unknown as { processRequest: ReturnType<typeof vi.fn> })
      .processRequest.mock.calls[0][0];
    expect(call.messages[0].content).toContain('wie hoch ist der gesamtgewinn?');
    expect(call.messages[0].content).toContain('Region | Umsatz | Gewinn');
    expect(call.options.response_format).toEqual({ type: 'json_object' });
  });

  it('prefers the raw last user message over a rewritten searchQuery', async () => {
    const state = makeState('{"related": true, "code": "print(1)"}', {
      searchQuery: 'Grüne Umsatzentwicklung Landesverband Bericht',
    } as Partial<ChatGraphState>);
    await pandasComputeNode(state);
    const call = (state.aiWorkerPool as unknown as { processRequest: ReturnType<typeof vi.fn> })
      .processRequest.mock.calls[0][0];
    expect(call.messages[0].content).toContain('wie hoch ist der gesamtgewinn?');
    expect(call.messages[0].content).not.toContain('Landesverband Bericht');
  });

  it('includes the failed code + error in the correction round prompt', async () => {
    const state = makeState('{"related": true, "code": "print(2)"}');
    await pandasComputeNode(state, {
      previousCode: 'print(df["Gewinnn"].sum())',
      previousError: "KeyError: 'Gewinnn'",
    });
    const call = (state.aiWorkerPool as unknown as { processRequest: ReturnType<typeof vi.fn> })
      .processRequest.mock.calls[0][0];
    expect(call.messages[0].content).toContain('FEHLGESCHLAGEN');
    expect(call.messages[0].content).toContain('print(df["Gewinnn"].sum())');
    expect(call.messages[0].content).toContain("KeyError: 'Gewinnn'");
  });

  it('returns null for unrelated questions (escape valve)', async () => {
    const state = makeState('{"related": false, "code": ""}');
    expect(await pandasComputeNode(state)).toEqual({ pythonCode: null });
  });

  it('returns null without table context', async () => {
    const state = makeState('{"related": true, "code": "print(1)"}', {
      threadAttachments: [],
      attachmentContext: null,
    } as Partial<ChatGraphState>);
    expect(await pandasComputeNode(state)).toEqual({ pythonCode: null });
  });

  it('returns null when the LLM call throws', async () => {
    const state = makeState('');
    (
      state.aiWorkerPool as unknown as { processRequest: ReturnType<typeof vi.fn> }
    ).processRequest.mockRejectedValue(new Error('provider down'));
    expect(await pandasComputeNode(state)).toEqual({ pythonCode: null });
  });
});
