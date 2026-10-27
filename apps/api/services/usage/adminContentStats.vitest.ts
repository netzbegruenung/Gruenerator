import { describe, expect, it, vi } from 'vitest';

vi.mock('../../database/services/NotebookQdrantHelper.js', () => ({
  NotebookQdrantHelper: vi.fn(),
}));
vi.mock('../../database/services/PostgresService.js', () => ({ getPostgresInstance: vi.fn() }));
vi.mock('../../utils/redis/jsonCache.js', () => ({
  getCachedJson: vi.fn(),
  setCachedJson: vi.fn(),
}));

const { snapWindow, suppressGrid } = await import('./adminContentStats.js');
type Grid = import('./adminContentStats.js').Grid;
type Cell = import('./adminContentStats.js').Cell;

const cell = (people: number, items = people): Cell => ({ items, people, hidden: false });

/** rows: subtype → [de, at, unknown] people; totals people per segment. */
function grid(
  rows: Record<string, [number, number, number]>,
  totals: [number, number, number]
): Grid {
  return {
    rows: new Map(
      Object.entries(rows).map(([k, [de, at, unknown]]) => [
        k,
        { de: cell(de), at: cell(at), unknown: cell(unknown) },
      ])
    ),
    totals: { de: cell(totals[0]), at: cell(totals[1]), unknown: cell(totals[2]) },
  };
}

const hiddenOf = (g: Grid) => [
  ...[...g.rows].flatMap(([k, row]) =>
    (['de', 'at', 'unknown'] as const).filter((s) => row[s].hidden).map((s) => `${k}.${s}`)
  ),
  ...(['de', 'at', 'unknown'] as const).filter((s) => g.totals[s].hidden).map((s) => `total.${s}`),
];

/** Every value a reader of the unfiltered view plus one country view can work out. */
function recoverable(g: Grid): string[] {
  const known = new Set<string>();
  const segments = ['de', 'at', 'unknown'] as const;
  for (const [k, row] of g.rows)
    for (const s of segments) if (!row[s].hidden) known.add(`${k}.${s}`);
  for (const s of segments) if (!g.totals[s].hidden) known.add(`total.${s}`);
  let grew = true;
  while (grew) {
    grew = false;
    const lines: string[][] = [
      ...[...g.rows.keys()].map((k) => segments.map((s) => `${k}.${s}`)),
      segments.map((s) => `total.${s}`),
    ];
    // A column only closes when its total is known.
    for (const s of segments) {
      if (known.has(`total.${s}`)) lines.push([...g.rows.keys()].map((k) => `${k}.${s}`));
    }
    for (const line of lines) {
      const open = line.filter((id) => !known.has(id));
      if (open.length === 1) {
        known.add(open[0]);
        grew = true;
      }
    }
  }
  return [...known];
}

describe('suppressGrid', () => {
  it('hides nothing when every cell has enough people', () => {
    const g = grid({ a: [10, 8, 6] }, [10, 8, 6]);
    suppressGrid(g, 'max');
    expect(hiddenOf(g)).toEqual([]);
  });

  it('hides a thin cell and a partner, using the smallest one first', () => {
    const g = grid({}, [100, 3, 7]);
    suppressGrid(g, 'max');
    expect(hiddenOf(g)).toEqual(['total.at', 'total.unknown']);
  });

  it('a cell of exactly MIN_GROUP_SIZE people is published', () => {
    const g = grid({}, [100, 5, 0]);
    suppressGrid(g, 'max');
    expect(hiddenOf(g)).toEqual([]);
  });

  it('a thin cell next to zeros takes a large one with it', () => {
    const g = grid({}, [100, 4, 0]);
    suppressGrid(g, 'max');
    expect(hiddenOf(g)).toEqual(['total.de', 'total.at']);
  });

  it('never leaves a hidden thin cell recoverable by subtraction', () => {
    // a.at is thin; the naive fix (hide a.de, b.at) would leave b.at alone in
    // row b, so b.at = b.all − b.de and then a.at = total.at − b.at.
    const g = grid({ a: [50, 2, 0], b: [50, 50, 0] }, [80, 51, 0]);
    suppressGrid(g, 'max');
    const known = recoverable(g);
    expect(known).not.toContain('a.at');
    expect(hiddenOf(g)).toContain('a.at');
  });

  it('holds over many random grids', () => {
    let seed = 7;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    for (let round = 0; round < 2000; round++) {
      const subtypes = 1 + rand(4);
      const rows: Record<string, [number, number, number]> = {};
      const totals: [number, number, number] = [0, 0, 0];
      for (let i = 0; i < subtypes; i++) {
        const r: [number, number, number] = [rand(12), rand(8), rand(4)];
        rows[`s${i}`] = r;
        r.forEach((v, s) => (totals[s] = Math.max(totals[s], v) + rand(2) * v));
      }
      const g = grid(rows, totals);
      suppressGrid(g, 'max');
      const known = new Set(recoverable(g));
      for (const [k, row] of g.rows) {
        for (const s of ['de', 'at', 'unknown'] as const) {
          const c = row[s];
          if (c.people > 0 && c.people < 5)
            expect(known.has(`${k}.${s}`), `round ${round}`).toBe(false);
        }
      }
      for (const s of ['de', 'at', 'unknown'] as const) {
        const c = g.totals[s];
        if (c.people > 0 && c.people < 5)
          expect(known.has(`total.${s}`), `round ${round}`).toBe(false);
      }
    }
  });
});

describe('snapWindow', () => {
  it('snaps a month window outward to whole months', () => {
    expect(snapWindow('2026-02-10', '2026-04-03', 'month')).toEqual({
      from: '2026-02-01',
      to: '2026-04-30',
      buckets: ['2026-02-01', '2026-03-01', '2026-04-01'],
    });
  });

  it('starts weeks on Monday', () => {
    // 2026-10-28 is a Wednesday.
    expect(snapWindow('2026-10-28', '2026-11-03', 'week')).toEqual({
      from: '2026-10-26',
      to: '2026-11-08',
      buckets: ['2026-10-26', '2026-11-02'],
    });
  });

  it('keeps days as they are', () => {
    expect(snapWindow('2026-03-29', '2026-03-30', 'day').buckets).toEqual([
      '2026-03-29',
      '2026-03-30',
    ]);
  });
});
