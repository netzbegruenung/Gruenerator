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

  it('paints the swatches from the sites-design palette of the locale', () => {
    const de = renderWithDraft(<VariantPicker />);
    const colour = (el: HTMLElement) =>
      el.querySelector<HTMLElement>('[aria-hidden="true"] span')?.style.backgroundColor;
    expect(colour(screen.getByRole('radio', { name: 'Dunkel' }))).toBe('rgb(0, 85, 56)');
    de.unmount();
    auth.locale = 'de-AT';
    renderWithDraft(<VariantPicker />);
    expect(colour(screen.getByRole('radio', { name: 'Dunkel' }))).toBe('rgb(37, 118, 57)');
    auth.locale = 'de-DE';
  });
});
