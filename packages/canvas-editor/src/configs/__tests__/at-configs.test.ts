import { describe, it, expect } from 'vitest';

import { getBrandTheme } from '../../brand/theme';
import { loadCanvasConfig } from '../configLoader';
import { getTemplatesForLocale } from '../../utils/templateRegistry';

const AT_IDS = ['info-at', 'zitat-at', 'zitat-pure-at', 'dreizeilen-at', 'freeform-at'] as const;

describe('Österreich (de-AT) canvas configs', () => {
  it.each(AT_IDS)('loads and builds config %s', async (id) => {
    const config = await loadCanvasConfig(id);
    expect(config).toBeTruthy();
    expect(config.id).toBe(id);
    expect(Array.isArray(config.elements)).toBe(true);
    expect(config.elements.length).toBeGreaterThan(0);
    // createInitialState must not throw
    const state = config.createInitialState({});
    expect(state).toBeTruthy();
  });

  it('brand theme exposes AT tokens', () => {
    const at = getBrandTheme('de-AT');
    expect(at.colors.primary).toBe('#257639');
    expect(at.colors.secondary).toBe('#56af31');
    expect(at.colors.accent).toBe('#FCEC00');
    expect(at.colors.stoerer).toBe('#E4007C');
    expect(at.fonts.headline).toBe('GothamNarrow-Ultra');
    expect(at.fonts.quoteEmphasis).toBe('Vollkorn');
    expect(at.logo?.src).toContain('gruene-at-logo');
  });

  it('getTemplatesForLocale gates AT vs DE', () => {
    const at = getTemplatesForLocale('de-AT').map((t) => t.id);
    const de = getTemplatesForLocale('de-DE').map((t) => t.id);
    expect(at).toEqual(expect.arrayContaining([...AT_IDS]));
    expect(at).not.toContain('info'); // DE-only stays hidden for AT
    expect(de).toContain('info');
    expect(de).not.toContain('info-at');
  });
});
