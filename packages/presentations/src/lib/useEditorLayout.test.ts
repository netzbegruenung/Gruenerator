import { describe, expect, it } from 'vitest';

import { getEditorLayout } from './useEditorLayout.js';

describe('getEditorLayout', () => {
  it('assumes roomy before the first measurement, so the layout never flashes compact', () => {
    expect(getEditorLayout({ width: 0, height: 0 })).toEqual({
      compact: false,
      designAsRail: true,
    });
  });

  it('keeps the rail on a landscape desktop window', () => {
    expect(getEditorLayout({ width: 1440, height: 900 })).toEqual({
      compact: false,
      designAsRail: true,
    });
  });

  it('goes compact once the editor box itself is narrow, not the window', () => {
    // 1024px window with the 320px chat panel open leaves the editor 704px.
    expect(getEditorLayout({ width: 704, height: 720 }).compact).toBe(true);
  });

  it('goes compact in portrait, where the rail spends the scarce axis', () => {
    expect(getEditorLayout({ width: 820, height: 1180 }).compact).toBe(true);
  });

  it('keeps the rail on a short landscape box — height is the scarce axis there', () => {
    expect(getEditorLayout({ width: 844, height: 390 }).compact).toBe(false);
  });

  it('drops the design rail to a sheet before the canvas gets too narrow to edit', () => {
    expect(getEditorLayout({ width: 1023, height: 800 }).designAsRail).toBe(false);
    expect(getEditorLayout({ width: 1024, height: 800 }).designAsRail).toBe(true);
  });
});
