import { setSiteField } from '@gruenerator/contracts/site-ydoc';
import { act, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithDraft } from '../test/renderWithDraft';

import { useDraft, useDraftActions } from './SiteDraftContext';

function Title() {
  const title = useDraft((draft) => draft.site_title);
  const { setField } = useDraftActions();
  return (
    <button type="button" onClick={() => setField('site_title', 'Geändert')}>
      {title}
    </button>
  );
}

describe('SiteDraftProvider', () => {
  it('renders the draft and follows edits made through the actions', async () => {
    const { user, ydoc } = renderWithDraft(<Title />, { site_title: 'Start' });
    expect(screen.getByRole('button')).toHaveTextContent('Start');
    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveTextContent('Geändert');
    expect(ydoc).toBeDefined();
  });

  it('follows remote changes to the doc', () => {
    const { ydoc } = renderWithDraft(<Title />, { site_title: 'Start' });
    act(() => {
      setSiteField(ydoc, 'site_title', 'Remote');
    });
    expect(screen.getByRole('button')).toHaveTextContent('Remote');
  });
});
