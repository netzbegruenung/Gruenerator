import { describe, expect, it } from 'vitest';

import {
  NUDGE_LIMIT,
  NUDGE_TEXT,
  lastAssistantText,
  nudgeForMissingReport,
} from './nudgeMissingReport.js';

import type { ModelMessage } from 'ai';

const REPORT = `# Bericht\n\n${'Inhalt. '.repeat(80)}`;

const history: ModelMessage[] = [
  { role: 'user', content: 'Frage' },
  { role: 'assistant', content: [{ type: 'text', text: 'Die Antwort ist 42.' }] },
];

describe('nudgeForMissingReport', () => {
  it('pushes a turn that ended without a report back to work', () => {
    expect(nudgeForMissingReport(history, {})).toEqual({ role: 'user', content: NUDGE_TEXT });
  });

  it('lets a run with a usable report end', () => {
    expect(nudgeForMissingReport(history, { '/bericht.md': REPORT })).toBeNull();
  });

  it('does not count a stub as a report', () => {
    expect(nudgeForMissingReport(history, { '/bericht.md': '# Titel' })).not.toBeNull();
  });

  it('gives up after the limit — a model that refuses twice is refusing', () => {
    const nudged: ModelMessage[] = [
      ...history,
      ...Array.from({ length: NUDGE_LIMIT }, () => ({
        role: 'user' as const,
        content: NUDGE_TEXT,
      })),
    ];
    expect(nudgeForMissingReport(nudged, {})).toBeNull();
  });
});

describe('lastAssistantText', () => {
  it('reads the newest assistant text, skipping tool calls', () => {
    const messages: ModelMessage[] = [
      ...history,
      {
        role: 'assistant',
        content: [{ type: 'tool-call', toolCallId: 'a', toolName: 'task', input: {} }],
      },
    ];
    expect(lastAssistantText(messages)).toBe('');
    expect(lastAssistantText(history)).toBe('Die Antwort ist 42.');
  });
});
