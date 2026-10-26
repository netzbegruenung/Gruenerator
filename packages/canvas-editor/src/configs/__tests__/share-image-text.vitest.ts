/**
 * Die Teilen-Leiste oben füllt den Alt-Text aus demselben Bildtext wie der
 * Teilen-Abschnitt der Seitenleiste. Ein Dreizeiler hat keine `headline` —
 * sein Text steht in `line1..3`, und das Feld oben blieb leer.
 */
import { describe, expect, it } from 'vitest';

import { dreizeilenFullConfig } from '../dreizeilen_full.config';
import { shareImageText } from '../shareSection';

describe('shareImageText', () => {
  it('liest beim Dreizeiler die drei Zeilen wie die Seitenleiste', () => {
    const state = {
      ...dreizeilenFullConfig.createInitialState({}),
      line1: 'Klima',
      line2: '**schützen**',
      line3: 'jetzt',
    };
    const section = dreizeilenFullConfig.sections.share ?? null;
    expect(shareImageText(section, state)).toBe('Klima\nschützen\njetzt');
    const sidebarProps = section?.propsFactory(state, {} as never) as { imageText: string };
    expect(shareImageText(section, state)).toBe(sidebarProps.imageText);
  });

  it('gibt ohne Teilen-Abschnitt oder Zustand null', () => {
    expect(shareImageText(null, { headline: 'x' })).toBeNull();
    expect(shareImageText(dreizeilenFullConfig.sections.share ?? null, null)).toBeNull();
  });
});
