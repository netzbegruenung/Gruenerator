// SPDX-License-Identifier: MPL-2.0
import { brandDefault, type BrandFonts, type BrandPack } from '@ggraphic/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { activeBrand, registerBrandPacks } from '@ggraphic/editor/brand/brandRegistry';
import { DocumentBrandContext } from '@ggraphic/editor/brand/documentBrand';
import { messages } from '@ggraphic/editor/i18n/messages';

import { axe } from '../../../test-utils';

import { FloatingFontRoleControl } from './FloatingFontRoleControl';

const packWith = (fonts: BrandFonts): BrandPack => ({ ...brandDefault, fonts });

const TWO = packWith({
  headline: 'Alpha Sans',
  body: 'Beta Serif',
  quoteShort: 'Alpha Sans',
  quoteEmphasis: 'Beta Serif',
});
const THREE = packWith({
  headline: 'Alpha Sans',
  body: 'Beta Serif',
  quoteShort: 'Alpha Sans',
  quoteEmphasis: 'Gamma Slab',
});

const original = activeBrand();
beforeEach(() => registerBrandPacks([TWO]));
afterEach(() => registerBrandPacks([original]));

const t = () => messages().topBar;
const picker = () => screen.queryByRole('combobox', { name: t().fontRole }) as HTMLSelectElement;
const options = () => Array.from(picker().options);

describe('FloatingFontRoleControl', () => {
  it('offers the distinct roles of the brand, each in its own font', () => {
    render(<FloatingFontRoleControl text={{ fontFamily: 'Alpha Sans' }} onChange={() => {}} />);
    expect(options().map((o) => o.value)).toEqual(['headline', 'body']);
    expect(options().map((o) => o.textContent)).toEqual([
      t().fontRoles.headline,
      t().fontRoles.body,
    ]);
    expect(options().map((o) => o.style.fontFamily)).toEqual([
      expect.stringContaining('Alpha Sans'),
      expect.stringContaining('Beta Serif'),
    ]);
  });

  it('reads the brand of the document, not the active one', () => {
    // The active brand has two families; the document's has three.
    render(
      <DocumentBrandContext.Provider value={THREE}>
        <FloatingFontRoleControl text={{ fontFamily: 'Alpha Sans' }} onChange={() => {}} />
      </DocumentBrandContext.Provider>
    );
    expect(options().map((o) => o.value)).toEqual(['headline', 'body', 'quoteEmphasis']);
    expect(options()[2]!.style.fontFamily).toContain('Gamma Slab');
  });

  it('is hidden when the brand offers fewer than two roles', () => {
    const one = packWith({
      headline: 'Alpha Sans',
      body: 'Alpha Sans',
      quoteShort: 'Alpha Sans',
      quoteEmphasis: 'Alpha Sans',
    });
    const { container } = render(
      <DocumentBrandContext.Provider value={one}>
        <FloatingFontRoleControl text={{ fontFamily: 'Alpha Sans' }} onChange={() => {}} />
      </DocumentBrandContext.Provider>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('selects the bound role', () => {
    render(
      <DocumentBrandContext.Provider value={THREE}>
        <FloatingFontRoleControl
          text={{
            fontFamily: 'Gamma Slab',
            bind: { fontFamily: { ref: 'font.quoteEmphasis', value: 'Gamma Slab' } },
          }}
          onChange={() => {}}
        />
      </DocumentBrandContext.Provider>
    );
    expect(picker().value).toBe('quoteEmphasis');
  });

  it('selects the role whose family the text uses when it is not bound', () => {
    render(
      <FloatingFontRoleControl
        text={{ fontFamily: 'Beta Serif, Arial, sans-serif' }}
        onChange={() => {}}
      />
    );
    expect(picker().value).toBe('body');
  });

  it('shows a family no role has as a disabled entry of its own', () => {
    render(<FloatingFontRoleControl text={{ fontFamily: 'Zeta Mono' }} onChange={() => {}} />);
    const custom = options()[0]!;
    expect(custom.textContent).toBe(t().fontRoleCustom('Zeta Mono'));
    expect(custom.disabled).toBe(true);
    expect(picker().selectedOptions[0]).toBe(custom);
    expect(options()).toHaveLength(3);
  });

  it('reports the role picked', () => {
    const onChange = vi.fn();
    render(<FloatingFontRoleControl text={{ fontFamily: 'Alpha Sans' }} onChange={onChange} />);
    fireEvent.change(picker(), { target: { value: 'body' } });
    expect(onChange).toHaveBeenCalledExactlyOnceWith('body');
  });

  describe('asking for the face of the family picked', () => {
    const load = vi.fn(() => Promise.resolve([]));
    beforeEach(() => {
      load.mockClear();
      Object.defineProperty(document, 'fonts', {
        configurable: true,
        value: { check: () => false, load, addEventListener: () => {}, ready: Promise.resolve() },
      });
    });
    afterEach(() => {
      Reflect.deleteProperty(document, 'fonts');
    });

    it('starts loading it before the text is switched to it', () => {
      const order: string[] = [];
      load.mockImplementation(() => {
        order.push('load');
        return Promise.resolve([]);
      });
      render(
        <FloatingFontRoleControl
          text={{ fontFamily: 'Alpha Sans' }}
          onChange={() => order.push('change')}
        />
      );
      fireEvent.change(picker(), { target: { value: 'body' } });
      expect(load).toHaveBeenCalledWith(
        expect.stringContaining('"Beta Serif"'),
        expect.any(String)
      );
      expect(order).toEqual(['load', 'change']);
    });
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <FloatingFontRoleControl text={{ fontFamily: 'Alpha Sans' }} onChange={() => {}} />
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
