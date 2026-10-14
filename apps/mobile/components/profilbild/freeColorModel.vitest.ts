import { parseFreeBackground, type Swatch } from '@gruenerator/shared/profilbild';
import { describe, expect, it } from 'vitest';

import { cdPalette, freeColorGrid, freeDefaults, hslToHex } from './freeColorModel';

describe('hslToHex', () => {
  it('converts the corners of the wheel', () => {
    expect(hslToHex(0, 100, 50)).toBe('#ff0000');
    expect(hslToHex(120, 100, 50)).toBe('#00ff00');
    expect(hslToHex(240, 100, 50)).toBe('#0000ff');
    expect(hslToHex(0, 0, 100)).toBe('#ffffff');
    expect(hslToHex(0, 0, 0)).toBe('#000000');
  });
});

describe('freeColorGrid', () => {
  it('only offers colours the saved format accepts', () => {
    const grid = freeColorGrid();
    expect(grid).toHaveLength(6);
    for (const color of grid.flat())
      expect(parseFreeBackground({ kind: 'color', color })).toEqual({ kind: 'color', color });
  });
});

describe('cdPalette', () => {
  it('keeps the plain colours of the swatches', () => {
    const swatches = [
      { id: 'a', label: 'Tanne', background: { kind: 'color', color: '#005538' } },
      {
        id: 'b',
        label: 'Verlauf',
        background: { kind: 'gradient', stops: ['#000000', '#ffffff'], angle: 0 },
      },
    ] as Swatch[];
    expect(cdPalette(swatches)).toEqual([{ hex: '#005538', label: 'Tanne' }]);
  });
});

describe('freeDefaults', () => {
  const palette = [
    { hex: '#005538', label: 'Tanne' },
    { hex: '#8abd24', label: 'Grashalm' },
  ];

  it('starts from the first CD colours', () => {
    expect(freeDefaults(null, palette)).toEqual({
      color: '#005538',
      gradient: { kind: 'gradient', stops: ['#005538', '#8abd24'], angle: 180 },
    });
  });

  it('keeps a current free choice', () => {
    expect(freeDefaults({ kind: 'color', color: '#123456' }, palette).color).toBe('#123456');
  });
});
