import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('../../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query }),
}));

const { getThreadRecallContext } = await import('./pastChatRecallService.js');

/**
 * "Was hatten wir letztes Mal beschlossen?" — the decision is the NEWEST content
 * in the thread. The transcript was assembled oldest-first and then head-sliced,
 * so the answer was the first thing dropped while the small talk survived.
 */
describe('getThreadRecallContext transcript window', () => {
  beforeEach(() => query.mockReset());

  const thread = [{ title: 'Test', updated_at: '2026-07-26T00:00:00Z', compaction_summary: null }];

  function messages(...contents: string[]) {
    // The query orders DESC, so the newest row comes first.
    return contents.map((content, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', content }));
  }

  it('keeps the NEWEST exchange when the transcript exceeds the budget', async () => {
    query
      .mockResolvedValueOnce(thread)
      .mockResolvedValueOnce(messages('ENTSCHEIDUNG: wir nehmen Variante B', 'x'.repeat(6_000)));

    const out = await getThreadRecallContext('t1', 'u1', { maxChars: 2_000 });
    expect(out?.transcript).toContain('ENTSCHEIDUNG');
  });

  it('marks that something was cut off the front', async () => {
    query
      .mockResolvedValueOnce(thread)
      .mockResolvedValueOnce(messages('neueste Nachricht', 'y'.repeat(6_000)));

    const out = await getThreadRecallContext('t1', 'u1', { maxChars: 1_000 });
    expect(out?.transcript.startsWith('…')).toBe(true);
  });

  it('respects the budget', async () => {
    query
      .mockResolvedValueOnce(thread)
      .mockResolvedValueOnce(messages('a'.repeat(9_000), 'b'.repeat(9_000)));

    const out = await getThreadRecallContext('t1', 'u1', { maxChars: 500 });
    // budget + the leading ellipsis and its newline
    expect(out!.transcript.length).toBeLessThanOrEqual(502);
  });

  it('leaves a short transcript untouched — no ellipsis, no reordering', async () => {
    query.mockResolvedValueOnce(thread).mockResolvedValueOnce(messages('zweite', 'erste'));

    const out = await getThreadRecallContext('t1', 'u1', { maxChars: 4_000 });
    expect(out?.transcript.startsWith('…')).toBe(false);
    // `.reverse()` restores chronological order: oldest line first.
    expect(out!.transcript.indexOf('erste')).toBeLessThan(out!.transcript.indexOf('zweite'));
  });
});
