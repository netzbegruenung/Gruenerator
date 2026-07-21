import { describe, it, expect } from 'vitest';

import { parseSseEvents, parseTrace } from './parseTrace.js';

function frame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

describe('parseSseEvents', () => {
  it('parses event/data frames and skips keep-alives', () => {
    const raw = frame('intent', { intent: 'agentic', agentic: true }) + ':\n\n' + frame('done', {});
    const events = parseSseEvents(raw);
    expect(events.map((e) => e.event)).toEqual(['intent', 'done']);
    expect(events[0].data).toMatchObject({ intent: 'agentic', agentic: true });
  });

  it('survives malformed data without throwing', () => {
    const events = parseSseEvents('event: x\ndata: {not json\n\n');
    expect(events[0].data).toHaveProperty('_unparsed');
  });
});

describe('buildTrace', () => {
  it('reconstructs tool calls by pairing start+result', () => {
    const raw =
      frame('intent', { intent: 'agentic', agentic: true }) +
      frame('tool_step_start', {
        stepId: 's1',
        toolName: 'gruenerator_search',
        args: { query: 'x' },
      }) +
      frame('tool_step_result', {
        stepId: 's1',
        toolName: 'gruenerator_search',
        ok: true,
        summary: '5 Ergebnisse',
      }) +
      frame('text_delta', { text: 'Antwort ' }) +
      frame('text_delta', { text: 'hier [1].' }) +
      frame('done', { citations: [{ id: 1 }] });
    const t = parseTrace(raw, 1234);
    expect(t.intent).toBe('agentic');
    expect(t.agentic).toBe(true);
    expect(t.toolCalls).toHaveLength(1);
    expect(t.toolCalls[0]).toMatchObject({ toolName: 'gruenerator_search', ok: true });
    expect(t.fullText).toBe('Antwort hier [1].');
    expect(t.sources).toBe(1);
    expect(t.latencyMs).toBe(1234);
    expect(t.error).toBeNull();
  });

  it('marks a failed tool result ok:false (e.g. 404 scrape)', () => {
    const raw =
      frame('tool_step_start', {
        stepId: 's1',
        toolName: 'scrape_url',
        args: { url: 'https://x' },
      }) +
      frame('tool_step_result', {
        stepId: 's1',
        toolName: 'scrape_url',
        ok: false,
        result: { error: '404' },
      }) +
      frame('done', {});
    const t = parseTrace(raw, 1);
    expect(t.toolCalls[0].ok).toBe(false);
    expect(t.toolCalls[0].result?.error).toBe('404');
  });

  it('detects a real sharepic generation (variants, no error) vs a failed one', () => {
    const okRaw =
      frame('sharepic_complete', { message: 'x', variants: [{ type: 'zitat' }] }) +
      frame('done', {});
    expect(parseTrace(okRaw, 1).sharepicGenerated).toBe(true);
    const failRaw = frame('sharepic_complete', { message: 'x', error: 'boom' }) + frame('done', {});
    expect(parseTrace(failRaw, 1).sharepicGenerated).toBe(false);
  });

  it('flags a stream that never produced done', () => {
    const t = parseTrace(frame('text_delta', { text: 'hi' }), 1);
    expect(t.error).toMatch(/without a done/);
  });
});
