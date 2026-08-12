import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { describe, expect, it } from 'vitest';

import { describeFinalState } from './finalState.js';
import { NUDGE_LIMIT, NUDGE_TEXT, nudgeMissingReportMiddleware } from './nudgeMissingReport.js';

/**
 * Guards the incident of 11.08.2026: the lead model answered its very first
 * turn directly — no tool call, no `/bericht.md` — and the run ended after
 * three seconds as a regular completion. The middleware must turn that silent
 * ending into another model turn, and must stop pushing once the model has
 * ignored the nudge twice.
 */

interface MiddlewareResult {
  messages?: unknown[];
  jumpTo?: string;
}

const afterModel = nudgeMissingReportMiddleware.afterModel as {
  canJumpTo?: string[];
  hook: (state: { messages?: unknown[]; files?: unknown }) => MiddlewareResult | undefined;
};
const hook = afterModel.hook;

const REPORT = { '/bericht.md': { content: `# Titel\n\n${'Inhalt. '.repeat(80)}` } };

function bareAi(content = ''): AIMessage {
  return new AIMessage({ content, tool_calls: [] });
}

function aiWithCall(): AIMessage {
  return new AIMessage({
    content: '',
    tool_calls: [{ name: 'web_suche', args: {}, id: 'c1', type: 'tool_call' }] as never,
  });
}

describe('nudgeMissingReportMiddleware', () => {
  it('nudges and jumps back to the model when a turn ends without tool calls and without a report', () => {
    const result = hook({ messages: [bareAi('Die AfD im Rhein-Sieg-Kreis ist …')] });

    expect(result?.jumpTo).toBe('model');
    expect(afterModel.canJumpTo).toContain('model');
    const nudge = result?.messages?.[0] as HumanMessage;
    expect(nudge).toBeInstanceOf(HumanMessage);
    expect(nudge.content).toBe(NUDGE_TEXT);
  });

  it('lets the run end when a usable report exists — that ending is the normal one', () => {
    expect(hook({ messages: [bareAi()], files: REPORT })).toBeUndefined();
  });

  it('ignores turns that are still working (tool calls pending)', () => {
    expect(hook({ messages: [aiWithCall()] })).toBeUndefined();
  });

  it('ignores non-AI last messages and empty histories', () => {
    expect(hook({ messages: [new HumanMessage('hallo')] })).toBeUndefined();
    expect(hook({ messages: [] })).toBeUndefined();
    expect(hook({})).toBeUndefined();
  });

  it('gives up after the nudge limit, so a refusing model is not pushed forever', () => {
    const nudged = Array.from({ length: NUDGE_LIMIT }, () => [
      new HumanMessage(NUDGE_TEXT),
      bareAi('Ich kann dazu nichts recherchieren.'),
    ]).flat();

    expect(hook({ messages: [bareAi(), ...nudged] })).toBeUndefined();
  });

  it('still nudges below the limit, counting only its own marker messages', () => {
    const messages = [
      new HumanMessage('die eigentliche Frage'),
      new HumanMessage(NUDGE_TEXT),
      bareAi('Trotzdem nur Text.'),
    ];

    expect(hook({ messages })?.jumpTo).toBe('model');
  });

  it('treats a stub below the usable-report threshold as missing', () => {
    const stub = { '/bericht.md': { content: '# Titel\n\nZu kurz.' } };

    expect(hook({ messages: [bareAi()], files: stub })?.jumpTo).toBe('model');
  });
});

describe('describeFinalState', () => {
  it('quotes the last AI utterance, truncated, with the message count', () => {
    const line = describeFinalState({
      messages: [new HumanMessage('Frage'), new AIMessage({ content: 'Kurze Direktantwort.' })],
    });

    expect(line).toContain('2 Nachricht(en)');
    expect(line).toContain('Kurze Direktantwort.');
  });

  it('marks an empty final answer instead of quoting nothing', () => {
    expect(describeFinalState({ messages: [new AIMessage({ content: '' })] })).toContain('<leer>');
    expect(describeFinalState(null)).toContain('0 Nachricht(en)');
  });
});
