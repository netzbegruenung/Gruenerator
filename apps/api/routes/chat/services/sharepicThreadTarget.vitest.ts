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

const { threadHasSharepic, resolveTarget, parseVariantReference } =
  await import('./sharepicEditService.js');
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

/** A sharepic row with SEVERAL variants, in the order the thumbnails show. */
function multiVariantRow(id: string, canvasTypes: string[]) {
  return {
    id,
    tool_results: {
      toolCalls: [
        {
          toolName: 'sharepic',
          result: {
            variants: canvasTypes.map((canvasType, i) => ({
              id: `${id}-v${i + 1}`,
              canvasType,
              initialProps: {},
            })),
          },
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

describe('parseVariantReference', () => {
  const types = ['dreizeilen', 'zitat-pure', 'info'];

  it('reads the position the thumbnails show', () => {
    expect(parseVariantReference('Füge folgende Bullet Points auf Variante 3 ein:', types)).toEqual(
      {
        index: 2,
        explicit: true,
      }
    );
    expect(parseVariantReference('variante 1 bitte kürzer', types)?.index).toBe(0);
    expect(parseVariantReference('nimm die dritte Variante', types)?.index).toBe(2);
    expect(parseVariantReference('in der zweiten Variante den Text ändern', types)?.index).toBe(1);
  });

  it('reads a label attached to "Variante" as explicit', () => {
    expect(parseVariantReference('Bestück die Info-Variante mit den Punkten', types)).toEqual({
      index: 2,
      explicit: true,
    });
    expect(parseVariantReference('die Variante Zitat bitte', types)).toEqual({
      index: 1,
      explicit: true,
    });
  });

  it('reads a bare label, but only as a tie-breaker', () => {
    // "Zitat"/"Info" are also content nouns in an edit instruction.
    expect(parseVariantReference('mach den Dreizeiler kürzer', types)).toEqual({
      index: 0,
      explicit: false,
    });
    expect(parseVariantReference('ändere das Zitat', types)).toEqual({ index: 1, explicit: false });
  });

  it('prefers the position over a label in the same sentence', () => {
    expect(parseVariantReference('Füge in Variante 1 das Zitat von Habeck ein', types)?.index).toBe(
      0
    );
  });

  it('never matches the generic "Sharepic" label, and never an ambiguous label', () => {
    expect(parseVariantReference('mach das Sharepic dunkler', ['simple', 'info'])).toBeNull();
    expect(parseVariantReference('ändere das Zitat', ['zitat', 'zitat-pure'])).toBeNull();
  });

  it('hands an out-of-range position back as-is', () => {
    expect(parseVariantReference('Variante 5 bitte', types)?.index).toBe(4);
  });

  it('is null without a mention', () => {
    expect(parseVariantReference('mach den Text größer', types)).toBeNull();
  });
});

describe('resolveTarget — a named variant', () => {
  const triple = ['dreizeilen', 'zitat-pure', 'info'];
  const activeRow = (variantId: string, canvasType: string) => ({
    variant_id: variantId,
    canvas_id: `c-${variantId}`,
    canvas_type: canvasType,
    is_active: true,
  });

  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('resolves "Variante 3" to the third variant of the last sharepic message', async () => {
    mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([multiVariantRow('m1', triple)]);
    const target = await resolveTarget('t1', null, 'Füge die Bullet Points auf Variante 3 ein');
    expect(target).toMatchObject({ variantId: 'm1-v3', canvasType: 'info', messageId: 'm1' });
  });

  it('lets an explicit position beat the active canvas row', async () => {
    // Live shape: variant 1 was edited earlier (active row), the person now
    // names variant 2. Before, the active row won silently.
    mockQuery
      .mockResolvedValueOnce([activeRow('m1-v1', 'dreizeilen')])
      .mockResolvedValueOnce([multiVariantRow('m1', triple)]);
    const target = await resolveTarget('t1', null, 'Variante 2: mach das Zitat kürzer');
    expect(target).toMatchObject({ variantId: 'm1-v2', canvasId: null });
  });

  it('keeps the active row when the text only mentions a label as content', async () => {
    // "das Zitat" here is the thing to insert, not the variant to edit.
    mockQuery
      .mockResolvedValueOnce([activeRow('m1-v1', 'dreizeilen')])
      .mockResolvedValueOnce([multiVariantRow('m1', triple)]);
    const target = await resolveTarget('t1', null, 'Füg in Zeile 2 das Zitat von Habeck ein');
    expect(target).toMatchObject({ variantId: 'm1-v1', canvasId: 'c-m1-v1' });
  });

  it('uses a bare label to break the tie when no row is active', async () => {
    mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([multiVariantRow('m1', triple)]);
    const target = await resolveTarget('t1', null, 'ändere das Zitat');
    expect(target).toMatchObject({ variantId: 'm1-v2', canvasType: 'zitat-pure' });
  });

  it('reuses the minted canvas of the named variant when one exists', async () => {
    mockQuery
      .mockResolvedValueOnce([
        { variant_id: 'm1-v3', canvas_id: 'c3', canvas_type: 'info', is_active: false },
      ])
      .mockResolvedValueOnce([multiVariantRow('m1', triple)]);
    const target = await resolveTarget('t1', null, 'die Info-Variante bitte anpassen');
    expect(target).toMatchObject({ variantId: 'm1-v3', canvasId: 'c3' });
  });

  it('asks back with the real labels when the position does not exist', async () => {
    mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([multiVariantRow('m1', triple)]);
    const target = await resolveTarget('t1', null, 'Variante 5 anpassen');
    expect(target).toEqual({ ambiguous: true, labels: ['Dreizeiler', 'Zitat', 'Info'] });
  });

  it('falls back to the active row when the newest sharepic cannot hold the position', async () => {
    // An older three-variant sharepic was edited (active row), the newest has
    // one variant: "Variante 3" cannot mean the newest, so the row stands.
    mockQuery
      .mockResolvedValueOnce([activeRow('m0-v3', 'info')])
      .mockResolvedValueOnce([multiVariantRow('m1', ['dreizeilen'])]);
    const target = await resolveTarget('t1', null, 'Variante 3: Text kürzer');
    expect(target).toMatchObject({ variantId: 'm0-v3', canvasId: 'c-m0-v3' });
  });

  it('asks back with the real labels when nothing names a variant', async () => {
    mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([multiVariantRow('m1', triple)]);
    const target = await resolveTarget('t1', null, 'mach den Text größer');
    expect(target).toEqual({ ambiguous: true, labels: ['Dreizeiler', 'Zitat', 'Info'] });
  });

  it('still falls back to the active row when the text names nothing', async () => {
    mockQuery
      .mockResolvedValueOnce([activeRow('m1-v1', 'dreizeilen')])
      .mockResolvedValueOnce([multiVariantRow('m1', triple)]);
    const target = await resolveTarget('t1', null, 'mach den Text größer');
    expect(target).toMatchObject({ variantId: 'm1-v1', canvasId: 'c-m1-v1' });
    // …and never paid for the message-table scan to find that out.
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('never reads the message table for the precondition when a row is active', async () => {
    mockQuery.mockResolvedValueOnce([activeRow('m1-v1', 'dreizeilen')]);
    expect(await resolveTarget('t1', null)).toMatchObject({ variantId: 'm1-v1' });
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});
