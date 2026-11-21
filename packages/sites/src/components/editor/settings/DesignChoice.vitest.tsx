import { decodeSiteDraft } from '@gruenerator/contracts/site-ydoc';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithDraft } from '../../../test/renderWithDraft';

import { DesignChoice } from './DesignChoice';

describe('DesignChoice', () => {
  it('starts with a white header and writes the coloured one', async () => {
    const { user, ydoc } = renderWithDraft(<DesignChoice field="header" />);
    expect(screen.getByRole('radio', { name: 'Weiß' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'In Farbvariante' }));
    expect(decodeSiteDraft(ydoc).header).toBe('farbig');
  });
});
