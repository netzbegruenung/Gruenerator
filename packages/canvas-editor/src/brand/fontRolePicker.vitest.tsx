/**
 * The font role picker offers roles of the document's own brand: German (Überschrift, Text) or
 * Austrian (Überschrift, Text, Akzent), whichever brand is the active one.
 */
import { fontRoleOptions } from '@ggraphic/core';
import { activeBrand, registerBrandPacks } from '@ggraphic/editor/brand/brandRegistry';
import { DocumentBrandContext } from '@ggraphic/editor/brand/documentBrand';
import { FloatingFontRoleControl } from '@ggraphic/editor/components/TopBar/modules/FloatingFontRoleControl';
import { messages } from '@ggraphic/editor/i18n/messages';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GRUENE_BRAND_PACKS } from './grueneBrandPacks';
import { GRUENE_AT, GRUENE_DE } from './theme';

const original = activeBrand();
beforeEach(() => registerBrandPacks(GRUENE_BRAND_PACKS));
afterEach(() => registerBrandPacks([original]));

const roles = () =>
  Array.from(
    (screen.getByRole('combobox', { name: messages().topBar.fontRole }) as HTMLSelectElement)
      .options
  ).map((o) => o.value);

describe('font roles of the Grünerator brands', () => {
  it('offers headline and body on the German brand', () => {
    expect(fontRoleOptions(GRUENE_DE).map((o) => o.role)).toEqual(['headline', 'body']);
  });

  it('offers a third, accent role on the Austrian brand', () => {
    expect(fontRoleOptions(GRUENE_AT).map((o) => o.role)).toEqual(['headline', 'body', 'serif']);
  });

  it('offers no handwriting: ggraphic has no such role', () => {
    for (const pack of [GRUENE_DE, GRUENE_AT]) {
      expect(fontRoleOptions(pack).map((o) => o.role)).not.toContain('handwriting');
    }
  });

  it('reads the Austrian brand of the document while the active brand is German', () => {
    expect(activeBrand().id).toBe(GRUENE_DE.id);
    render(
      <DocumentBrandContext.Provider value={GRUENE_AT}>
        <FloatingFontRoleControl text={{ fontFamily: 'Vollkorn' }} onChange={() => {}} />
      </DocumentBrandContext.Provider>
    );
    expect(roles()).toEqual(['headline', 'body', 'serif']);
  });

  it('shows two roles on a German document', () => {
    render(
      <DocumentBrandContext.Provider value={GRUENE_DE}>
        <FloatingFontRoleControl text={{ fontFamily: 'PT Sans' }} onChange={() => {}} />
      </DocumentBrandContext.Provider>
    );
    expect(roles()).toEqual(['headline', 'body']);
  });
});
