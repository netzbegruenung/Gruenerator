import { describe, it, expect } from 'vitest';

import { formatConversationHistory } from './classifierNode.js';

import type { ModelMessage } from 'ai';

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeMessage(role: 'user' | 'assistant', content: string): ModelMessage {
  return { role, content } as ModelMessage;
}

function makeMessages(count: number, contentLength = 100): ModelMessage[] {
  return Array.from({ length: count }, (_, i) => {
    const role = i % 2 === 0 ? 'user' : 'assistant';
    const text = `Message ${i + 1}: ${'x'.repeat(contentLength)}`;
    return makeMessage(role as 'user' | 'assistant', text);
  });
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('formatConversationHistory', () => {
  it('returns null for single-message conversation', () => {
    const messages = [makeMessage('user', 'Hallo')];
    expect(formatConversationHistory(messages)).toBeNull();
  });

  it('returns null for empty array', () => {
    // Edge case: no messages at all
    expect(formatConversationHistory([])).toBeNull();
  });

  it('formats a 2-message conversation (1 prior + 1 current)', () => {
    const messages = [makeMessage('user', 'Erste Frage'), makeMessage('user', 'Zweite Frage')];

    const result = formatConversationHistory(messages);

    expect(result).not.toBeNull();
    expect(result).toContain('GESPRÄCHSVERLAUF:');
    expect(result).toContain('Nutzer: Erste Frage');
    // Current message (last) should NOT be in the output
    expect(result).not.toContain('Zweite Frage');
  });

  it('caps to last 5 prior messages when conversation is longer', () => {
    // 10 messages total: indices 0-8 are "prior", index 9 is "current"
    // Should include only messages 4-8 (the last 5 prior)
    const messages = makeMessages(10, 50);

    const result = formatConversationHistory(messages)!;

    // Messages 1-4 should be excluded (too old)
    expect(result).not.toContain('Message 1:');
    expect(result).not.toContain('Message 4:');

    // Messages 5-9 should be included (last 5 prior)
    expect(result).toContain('Message 5:');
    expect(result).toContain('Message 9:');

    // Message 10 is the "current" message, excluded
    expect(result).not.toContain('Message 10:');
  });

  it('truncates individual messages longer than 500 chars', () => {
    const longContent = 'A'.repeat(800);
    const messages = [
      makeMessage('assistant', longContent),
      makeMessage('user', 'Follow-up question'),
    ];

    const result = formatConversationHistory(messages)!;

    // Should contain truncated version (500 chars + ellipsis)
    expect(result).toContain('A'.repeat(500));
    // Should NOT contain the full 800-char string
    expect(result).not.toContain('A'.repeat(501));
    // Should have ellipsis indicating truncation
    expect(result).toContain('\u2026'); // Unicode ellipsis
  });

  it('does NOT truncate messages at or under 500 chars', () => {
    const exactContent = 'B'.repeat(500);
    const messages = [makeMessage('user', exactContent), makeMessage('user', 'current')];

    const result = formatConversationHistory(messages)!;

    expect(result).toContain(exactContent);
    // No ellipsis added
    expect(result).not.toContain('\u2026');
  });

  it('labels roles correctly as Nutzer/Assistent', () => {
    const messages = [
      makeMessage('user', 'Frage'),
      makeMessage('assistant', 'Antwort'),
      makeMessage('user', 'Aktuelle Frage'),
    ];

    const result = formatConversationHistory(messages)!;

    expect(result).toContain('Nutzer: Frage');
    expect(result).toContain('Assistent: Antwort');
  });

  it('handles AI SDK parts format (array content)', () => {
    const partsMessage: ModelMessage = {
      role: 'assistant',
      content: [
        { type: 'text', text: 'First part. ' },
        { type: 'text', text: 'Second part.' },
      ],
    } as any;

    const messages = [partsMessage, makeMessage('user', 'Follow up')];

    const result = formatConversationHistory(messages)!;

    expect(result).toContain('Assistent: First part. Second part.');
  });

  it('worst-case token budget: 5 msgs x 500 chars = 2500 chars', () => {
    // 20 messages, each with 1000 chars of content
    const messages = makeMessages(20, 1000);

    const result = formatConversationHistory(messages)!;

    // Strip the "GESPRÄCHSVERLAUF:\n" prefix to measure content only
    const content = result.replace('GESPRÄCHSVERLAUF:\n', '');

    // Each message: "Nutzer: " or "Assistent: " (max 12 chars) + 500 chars + "..." = ~513 chars
    // 5 messages with "\n\n" separators = ~2573 chars max
    // This should be well under 3000 chars
    expect(content.length).toBeLessThan(3000);

    // And definitely NOT the full 20 * 1000 = 20000 chars
    expect(content.length).toBeLessThan(5000);
  });

  it('exactly 6 prior messages: takes last 5, drops oldest', () => {
    const messages = [
      makeMessage('user', 'DROPPED'),
      makeMessage('assistant', 'KEPT-1'),
      makeMessage('user', 'KEPT-2'),
      makeMessage('assistant', 'KEPT-3'),
      makeMessage('user', 'KEPT-4'),
      makeMessage('assistant', 'KEPT-5'),
      makeMessage('user', 'CURRENT'),
    ];

    const result = formatConversationHistory(messages)!;

    expect(result).not.toContain('DROPPED');
    expect(result).toContain('KEPT-1');
    expect(result).toContain('KEPT-5');
    expect(result).not.toContain('CURRENT');
  });
});
