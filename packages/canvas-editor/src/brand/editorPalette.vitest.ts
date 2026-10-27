/**
 * The editor's colour and font defaults moved from constants in the editor into
 * the brand packs. These are the values the editor had before, written out, so
 * the Grünerator keeps them exactly.
 */
import { activeBrand, registeredBrands } from '@ggraphic/editor/brand/brandRegistry';
import { describe, expect, it } from 'vitest';

import { GRUENE_AT, GRUENE_DE, getBrandPack } from './theme';

describe('the Grünerator packs carry the editor defaults unchanged', () => {
  it('offers the old picker palette, in order', () => {
    expect(GRUENE_DE.palette).toEqual([
      { id: 'tanne', label: 'Tanne', color: '#005538' },
      { id: 'klee', label: 'Klee', color: '#008939' },
      { id: 'grashalm', label: 'Grashalm', color: '#8ABD24' },
      { id: 'himmel', label: 'Himmel', color: '#0BA1DD' },
      { id: 'sand', label: 'Sand', color: '#F5F1E9' },
      { id: 'hellgruen', label: 'Hellgrün', color: '#6CCD87' },
      { id: 'dunkelgrau', label: 'Dunkelgrau', color: '#2E2E3D' },
      { id: 'white', label: 'Weiß', color: '#FFFFFF' },
      { id: 'black', label: 'Schwarz', color: '#000000' },
    ]);
  });

  it('offers the old text colours, in order', () => {
    expect(GRUENE_DE.textPalette).toEqual([
      { id: 'black', label: 'Schwarz', color: '#000000' },
      { id: 'white', label: 'Weiß', color: '#FFFFFF' },
      { id: 'tanne', label: 'Tanne', color: '#005538' },
      { id: 'sand', label: 'Sand', color: '#F5F1E9' },
      { id: 'klee', label: 'Klee', color: '#008939' },
    ]);
  });

  it('keeps the marker boxes and their dark ink', () => {
    expect(GRUENE_DE.markers).toEqual({
      swatches: [
        { id: 'limette', label: 'Limette', color: '#BEFF60' },
        { id: 'mint', label: 'Mint', color: '#77F6A5' },
        { id: 'grasgruen', label: 'Grasgrün', color: '#00CC4F' },
        { id: 'white', label: 'Weiß', color: '#FFFFFF' },
      ],
      ink: '#00261A',
    });
  });

  it('keeps both chart series', () => {
    expect(getBrandPack('de-DE').chart).toEqual([
      '#00261A',
      '#008939',
      '#00CC4F',
      '#005538',
      '#BEFF60',
    ]);
    expect(getBrandPack('de-AT').chart).toEqual([
      '#257639',
      '#56af31',
      '#FCEC00',
      '#0B6620',
      '#7CC650',
    ]);
  });

  it('keeps the element defaults the editor hardcoded', () => {
    expect(GRUENE_DE.colors.surface).toBe('#F5F1E9');
    expect(GRUENE_DE.colors.primary).toBe('#005538');
    expect(GRUENE_DE.colors.secondary).toBe('#6CCD87');
    expect(GRUENE_DE.colors.accent).toBe('#008939');
    expect(GRUENE_DE.defaultBackground).toBe('#005538');
    expect(GRUENE_DE.fonts.headline).toBe('GrueneTypeNeue');
  });

  it('sets the AT bold cut as its own family', () => {
    expect(GRUENE_AT.fonts.boldFamilies).toEqual({ 'GothamNarrow-Book': 'GothamNarrow-Bold' });
  });

  it('is what the test setup registers, DE first', () => {
    expect(activeBrand()).toBe(GRUENE_DE);
    expect(registeredBrands()).toEqual([GRUENE_DE, GRUENE_AT]);
  });
});
