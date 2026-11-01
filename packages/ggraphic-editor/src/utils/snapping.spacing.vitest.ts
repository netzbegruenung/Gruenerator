// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';

import {
  boxFrame,
  createBoxFrame,
  createSnapHysteresis,
  snapByBounds,
  snapSpacing,
  type SnapTarget,
} from '@ggraphic/editor/utils/snapping';

const t = (id: string, x: number, y: number, width: number, height: number): SnapTarget => ({
  id,
  x,
  y,
  width,
  height,
});

const gaps = (lines: { start: number; end: number }[]) =>
  lines.map((l) => Math.round((l.end - l.start) * 1000) / 1000);

describe('snapSpacing', () => {
  // Reihe: a 0–100, b 150–250 (Abstand 50), alle y 0–100.
  const row = [t('a', 0, 0, 100, 100), t('b', 150, 0, 100, 100)];

  it('setzt den Abstand zum Nachbarn auf einen vorhandenen Abstand der Reihe', () => {
    const hit = snapSpacing({ x: 290, y: 0, width: 100, height: 100 }, row, 'x');
    expect(hit?.delta).toBe(10);
    expect(gaps(hit!.lines)).toEqual([50, 50]);
    expect(hit!.lines.every((l) => l.kind === 'gap' && l.orientation === 'horizontal')).toBe(true);
  });

  it('mittelt zwischen zwei Nachbarn', () => {
    const pair = [t('l', 0, 0, 100, 100), t('r', 400, 0, 100, 100)];
    const hit = snapSpacing({ x: 190, y: 20, width: 100, height: 40 }, pair, 'x');
    expect(hit?.delta).toBe(10);
    expect(gaps(hit!.lines)).toEqual([100, 100]);
  });

  it('arbeitet auch senkrecht', () => {
    const column = [t('a', 0, 0, 100, 100), t('b', 0, 130, 100, 100)];
    const hit = snapSpacing({ x: 10, y: 255, width: 50, height: 50 }, column, 'y');
    expect(hit?.delta).toBe(5);
    expect(hit!.lines.every((l) => l.orientation === 'vertical')).toBe(true);
  });

  it('greift nicht außerhalb der Schwelle und nicht ohne Nachbarn in der Reihe', () => {
    expect(snapSpacing({ x: 400, y: 0, width: 100, height: 100 }, row, 'x')).toBeNull();
    expect(snapSpacing({ x: 290, y: 500, width: 100, height: 100 }, row, 'x')).toBeNull();
  });
});

describe('snapByBounds mit gleichen Abständen', () => {
  const row = [t('a', 0, 400, 100, 100), t('b', 150, 400, 100, 100)];

  it('rastet auf den gleichen Abstand ein, wenn keine Kante greift', () => {
    const frame = boxFrame(createBoxFrame(), 291, 400, 100, 100, 0, 'top-left');
    const r = snapByBounds(frame, row, 1080, 1350, createSnapHysteresis());
    expect(r.x).toBe(300);
    expect(r.snapLines.filter((l) => l.kind === 'gap')).toHaveLength(2);
  });

  it('lässt eine greifende Kante gewinnen', () => {
    // Linke Kante 248 liegt 2 px vor der rechten Kante von b (250).
    const frame = boxFrame(createBoxFrame(), 248, 400, 100, 100, 0, 'top-left');
    const r = snapByBounds(frame, row, 1080, 1350, createSnapHysteresis());
    expect(r.x).toBe(250);
    expect(r.snapLines.some((l) => l.kind === 'gap')).toBe(false);
  });
});
