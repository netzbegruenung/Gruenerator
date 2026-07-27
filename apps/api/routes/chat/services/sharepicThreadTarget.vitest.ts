import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * "Is there a sharepic in this thread?" — the precondition every sharepic edit
 * lane now has to satisfy, and the one the `edit-instruction` lane never did.
 *
 * Two separate defects live here:
 *
 *  1. The router asked `getLastSharepicVariant`, which read only the SINGLE most
 *     recent assistant message. Build a sharepic, ask one unrelated question,
 *     then say "mach den Text größer" — and the sharepic was invisible. The
 *     refinement silently became a fresh creation about the edit instruction.
 *  2. `resolveTarget` (handler side) scans 30 rows, so the router's answer and
 *     the handler's answer could disagree about the same thread.
 *
 * Both now read the same 30-row window.
 */

const mockQuery = vi.fn();

vi.mock('../../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: mockQuery }),
}));

const { threadHasSharepic } = await import('./sharepicEditService.js');
const { getLastSharepicVariant } = await import('./sharepicVariantHelpers.js');

/** An assistant row whose tool_results carry sharepic variants. */
function sharepicRow(id: string, canvasType = 'zitat') {
  return {
    id,
    tool_results: {
      toolCalls: [
        {
          toolName: 'sharepic',
          result: { variants: [{ id: `${id}-v1`, canvasType, initialProps: { zeile1: 'Test' } }] },
        },
      ],
    },
  };
}

/** An assistant row from an ordinary answer — tool_results without a sharepic. */
function plainRow(id: string) {
  return { id, tool_results: { toolCalls: [{ toolName: 'gruenerator_search', result: {} }] } };
}

describe('threadHasSharepic', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('is false on a thread that never made one', async () => {
    mockQuery.mockResolvedValue([]); // no canvases, no messages
    expect(await threadHasSharepic('t1')).toBe(false);
  });

  it('is true when an active canvas row exists', async () => {
    mockQuery.mockResolvedValueOnce([
      { variant_id: 'v1', canvas_id: 'c1', canvas_type: 'zitat', is_active: true },
    ]);
    expect(await threadHasSharepic('t1')).toBe(true);
  });

  it('still finds a sharepic three turns back', async () => {
    // THE regression: with LIMIT 1 the two intervening replies hid it and the
    // edit turned into a new sharepic about the edit instruction.
    mockQuery
      .mockResolvedValueOnce([]) // chat_thread_canvases: none
      .mockResolvedValueOnce([plainRow('m3'), plainRow('m2'), sharepicRow('m1')]);
    expect(await threadHasSharepic('t1')).toBe(true);
  });

  it('assumes a target on a DB error rather than licensing a fresh creation', async () => {
    // "No sharepic here" is the answer that permits creating one, so it must
    // never be the answer a failed query produces. The handler resolves
    // properly and declines.
    mockQuery.mockRejectedValue(new Error('connection reset'));
    expect(await threadHasSharepic('t1')).toBe(true);
  });
});

describe('getLastSharepicVariant', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('looks past intervening replies', async () => {
    mockQuery.mockResolvedValueOnce([plainRow('m3'), plainRow('m2'), sharepicRow('m1', 'info')]);
    expect(await getLastSharepicVariant('t1')).toEqual({
      canvasType: 'info',
      props: { zeile1: 'Test' },
    });
    // The row window is the actual defect — a mock hands back whatever it is
    // given regardless of the SQL, so iterating over rows would look fixed
    // while the query still asked for exactly one.
    expect(mockQuery.mock.calls[0]?.[0]).toMatch(/LIMIT 30/);
  });

  it('returns the NEWEST sharepic when several exist', async () => {
    mockQuery.mockResolvedValueOnce([sharepicRow('m2', 'dreizeilen'), sharepicRow('m1', 'zitat')]);
    expect(await getLastSharepicVariant('t1')).toMatchObject({ canvasType: 'dreizeilen' });
  });

  it('is null when the thread has no sharepic at all', async () => {
    mockQuery.mockResolvedValueOnce([plainRow('m2'), plainRow('m1')]);
    expect(await getLastSharepicVariant('t1')).toBeNull();
  });
});
