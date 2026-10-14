import { describe, expect, it } from 'vitest';

import { shouldDismissSheet } from './sheetDismiss';

const HEIGHT = 400;

describe('shouldDismissSheet', () => {
  it('keeps the sheet for a short, slow drag', () => {
    expect(shouldDismissSheet(40, 0, HEIGHT)).toBe(false);
  });

  it('dismisses a long, slow drag', () => {
    expect(shouldDismissSheet(200, 0, HEIGHT)).toBe(true);
  });

  it('dismisses a short downward flick', () => {
    expect(shouldDismissSheet(20, 800, HEIGHT)).toBe(true);
  });

  it('keeps the sheet when a long drag is flicked back up', () => {
    expect(shouldDismissSheet(200, -800, HEIGHT)).toBe(false);
  });
});
