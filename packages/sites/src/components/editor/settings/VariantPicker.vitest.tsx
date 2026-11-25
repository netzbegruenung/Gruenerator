import { decodeSiteDraft } from '@gruenerator/contracts/site-ydoc';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithDraft } from '../../../test/renderWithDraft';

const auth = vi.hoisted(() => ({ locale: 'de-DE' }));
vi.mock('../../../SitesContext', () => ({
  useAuth: () => ({ user: { id: 'u1', locale: auth.locale } }),
}));

import { VariantPicker } from './VariantPicker';

describe('VariantPicker', () => {
  it('choosing Hell writes variant', async () => {
    const { user, ydoc } = renderWithDraft(<VariantPicker />, { variant: 'dunkel' });
    expect(screen.getByRole('radio', { name: 'Dunkel' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Hell' }));
    expect(decodeSiteDraft(ydoc).variant).toBe('hell');
    expect(screen.getByRole('radio', { name: 'Hell' })).toBeChecked();
  });

  it('keeps the choice when the selected item is pressed again', async () => {
    const { user, ydoc } = renderWithDraft(<VariantPicker />, { variant: 'leuchtend' });
    await user.click(screen.getByRole('radio', { name: 'Leuchtend' }));
    expect(decodeSiteDraft(ydoc).variant).toBe('leuchtend');
  });

  it('paints the page in miniature from the sites-design palette of the locale', () => {
    const de = renderWithDraft(<VariantPicker />);
    // Bands top to bottom: white header, then the hero, which carries the variant.
    const bands = (name: string) =>
      [
        ...screen
          .getByRole('radio', { name })
          .querySelectorAll<HTMLElement>('[aria-hidden="true"] span'),
      ].map((band) => band.style.backgroundColor);
    expect(bands('Dunkel').slice(0, 2)).toEqual(['rgb(255, 255, 255)', 'rgb(0, 85, 56)']);
    expect(bands('Leuchtend')[1]).toBe('rgb(0, 204, 79)');
    expect(bands('Hell')[1]).toBe('rgb(245, 241, 233)');
    de.unmount();
    auth.locale = 'de-AT';
    renderWithDraft(<VariantPicker />);
    expect(bands('Dunkel')[1]).toBe('rgb(37, 118, 57)');
    auth.locale = 'de-DE';
  });
});
