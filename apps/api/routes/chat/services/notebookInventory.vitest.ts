import { describe, expect, it, vi } from 'vitest';

import {
  INVENTORY_PROMPT_LIMIT,
  loadInventory,
  renderSourceInventory,
} from './notebookInventory.js';

const NB = '5a438806-4e76-43c4-bf1e-1751708d123b';

function items(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    ref: `r${i}`,
    title: `Quelle ${i}.pdf`,
    detail: `${i + 1} S.`,
    pages: i + 1,
  }));
}

describe('renderSourceInventory', () => {
  it('lists every source with its detail and states the total', () => {
    const block = renderSourceInventory([
      {
        notebookId: NB,
        total: 2,
        items: [
          { ref: 'a', title: 'WP-06.pdf', detail: 'hochgeladen 2026-11-27 · 28 S.', pages: 28 },
          { ref: 'b', title: 'Satzung.pdf', detail: '', pages: null },
        ],
      },
    ]);
    expect(block).toContain('2 Quellen, vollständig');
    expect(block).toContain('- WP-06.pdf · hochgeladen 2026-11-27 · 28 S.');
    expect(block).toContain('- Satzung.pdf\n');
    expect(block).not.toContain('Satzung.pdf ·');
  });

  it('caps the inventory and keeps the total', () => {
    const block = renderSourceInventory([
      { notebookId: NB, total: 45, items: items(INVENTORY_PROMPT_LIMIT) },
    ]);
    expect(block).toContain(`45 Quellen, hier die ersten ${INVENTORY_PROMPT_LIMIT} nach Name`);
    expect(block.match(/^- Quelle /gm)).toHaveLength(INVENTORY_PROMPT_LIMIT);
  });

  it('is empty without lists', () => {
    expect(renderSourceInventory([])).toBe('');
  });
});

describe('loadInventory', () => {
  it('reads only own notebooks and drops failures', async () => {
    const sources = vi
      .fn()
      .mockResolvedValueOnce({ total: 1, items: items(1) })
      .mockRejectedValueOnce(new Error('qdrant down'));
    const lists = await loadInventory(
      [NB, 'berlin-system', '6b438806-4e76-43c4-bf1e-1751708d123b'],
      'user-1',
      sources
    );
    expect(sources).toHaveBeenCalledTimes(2);
    expect(sources).not.toHaveBeenCalledWith('berlin-system', expect.anything(), expect.anything());
    expect(lists).toHaveLength(1);
    expect(lists[0]!.notebookId).toBe(NB);
  });
});
