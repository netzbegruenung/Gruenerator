import { decodeSiteDraft } from '@gruenerator/contracts/site-ydoc';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { renderWithDraft } from '../../../test/renderWithDraft';

import { SectionVisibility } from './SectionVisibility';

describe('SectionVisibility', () => {
  it('lists the six optional sections, all on by default', () => {
    renderWithDraft(<SectionVisibility />);
    for (const label of ['Über mich', 'Hero-Bild', 'Themen', 'Aktionen', 'Instagram', 'Kontakt'])
      expect(screen.getByRole('switch', { name: label })).toBeChecked();
    expect(screen.queryByRole('switch', { name: 'Profil' })).toBeNull();
  });

  it('switching off Aktionen adds actions to hidden', async () => {
    const { user, ydoc } = renderWithDraft(<SectionVisibility />);
    await user.click(screen.getByRole('switch', { name: 'Aktionen' }));
    expect(decodeSiteDraft(ydoc).hidden).toEqual(['actions']);
    expect(screen.getByRole('switch', { name: 'Aktionen' })).not.toBeChecked();
  });

  it('keeps page order and switching on removes the entry', async () => {
    const { user, ydoc } = renderWithDraft(<SectionVisibility />, { hidden: ['contact'] });
    await user.click(screen.getByRole('switch', { name: 'Über mich' }));
    expect(decodeSiteDraft(ydoc).hidden).toEqual(['about', 'contact']);
    await user.click(screen.getByRole('switch', { name: 'Kontakt' }));
    expect(decodeSiteDraft(ydoc).hidden).toEqual(['about']);
  });

  it('has no axe violations', async () => {
    const { container } = renderWithDraft(<SectionVisibility />, { hidden: ['themes'] });
    expect(await axe(container)).toHaveNoViolations();
  });
});
