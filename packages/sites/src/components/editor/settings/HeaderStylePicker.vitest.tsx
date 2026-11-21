import { decodeSiteDraft } from '@gruenerator/contracts/site-ydoc';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithDraft } from '../../../test/renderWithDraft';

import { HeaderStylePicker } from './HeaderStylePicker';

describe('HeaderStylePicker', () => {
  it('starts white and writes the coloured header', async () => {
    const { user, ydoc } = renderWithDraft(<HeaderStylePicker />);
    expect(screen.getByRole('radio', { name: 'Weiß' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'In Farbvariante' }));
    expect(decodeSiteDraft(ydoc).header).toBe('farbig');
  });
});
