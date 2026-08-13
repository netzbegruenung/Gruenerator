import { describe, it, expect } from 'vitest';

import { backfillEmptyUserMessages } from './historyBackfill.js';

import type { ModelMessage } from 'ai';

const user = (text: string): ModelMessage => ({ role: 'user', content: text });
const bot = (text: string): ModelMessage => ({ role: 'assistant', content: text });

describe('backfillEmptyUserMessages', () => {
  it('restores the measured turn-3 shape', () => {
    // [u0 a2055 u0 a320 u714] — every earlier question arrived empty.
    const messages = [user(''), bot('a1'), user(''), bot('a2'), user('jetzt die Tabelle')];
    const filled = backfillEmptyUserMessages(messages, ['der Artikel', 'schwierige Wörter']);

    expect(filled).toBe(2);
    expect(messages[0]?.content).toBe('der Artikel');
    expect(messages[2]?.content).toBe('schwierige Wörter');
    expect(messages[4]?.content).toBe('jetzt die Tabelle');
  });

  it('leaves the current turn alone — it is not persisted yet', () => {
    const messages = [user('frage 1'), bot('a'), user('')];
    expect(backfillEmptyUserMessages(messages, ['frage 1'])).toBe(0);
    expect(messages[2]?.content).toBe('');
  });

  it('does nothing on the first turn', () => {
    expect(backfillEmptyUserMessages([user('hallo')], [])).toBe(0);
  });

  it('aligns from the end when the client replays only a suffix', () => {
    const messages = [user(''), bot('a'), user('neu')];
    expect(backfillEmptyUserMessages(messages, ['ganz alt', 'älter', 'die richtige'])).toBe(1);
    expect(messages[0]?.content).toBe('die richtige');
  });

  it('refuses to fill when a surviving message contradicts its row', () => {
    // Misalignment (edit-resubmit, deleted message): filling would put an
    // unrelated earlier question under this turn.
    const messages = [user('frage A'), bot('a'), user(''), bot('b'), user('neu')];
    expect(backfillEmptyUserMessages(messages, ['ganz andere frage', 'frage B'])).toBe(0);
    expect(messages[2]?.content).toBe('');
  });

  it('tolerates a message the client truncated for display', () => {
    const long = 'x'.repeat(400);
    const messages = [user(long.slice(0, 250)), bot('a'), user(''), bot('b'), user('neu')];
    expect(backfillEmptyUserMessages(messages, [long, 'frage B'])).toBe(1);
    expect(messages[2]?.content).toBe('frage B');
  });

  it('fills nothing when there is no persisted text', () => {
    const messages = [user(''), bot('a'), user('neu')];
    expect(backfillEmptyUserMessages(messages, [])).toBe(0);
  });
});
