import { type SiteBlock } from '@gruenerator/contracts';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithDraft } from '../../test/renderWithDraft';

import { BlockForm } from './BlockForm';

vi.mock('../../components/editor/common/ImageUpload', () => ({ ImageUpload: () => null }));
vi.mock('../../SitesContext', () => ({
  useAuth: () => ({ user: { id: 'u1', locale: 'de-DE' } }),
}));

const tile = (id: string, text: string) => ({ id, text, link: '#kontakt', imageUrl: '' });
const BLOCKS: SiteBlock[] = [
  { id: 'hero', type: 'hero' },
  { id: 'ac1', type: 'actions', items: [tile('a', 'Erste Kachel')] },
  { id: 'ac2', type: 'actions', items: [tile('b', 'Zweite Kachel')] },
];

describe('BlockForm', () => {
  it('shows the form of the block with that id', () => {
    renderWithDraft(<BlockForm blockId="ac2" />, { blocks: BLOCKS });
    expect(screen.getByDisplayValue('Zweite Kachel')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Erste Kachel')).toBeNull();
  });

  it('renders nothing for an unknown block', () => {
    const { container } = renderWithDraft(<BlockForm blockId="gone" />, { blocks: BLOCKS });
    expect(container).toBeEmptyDOMElement();
  });

  it('offers the hero layout on the profile form', () => {
    renderWithDraft(<BlockForm blockId="hero" />, { blocks: BLOCKS });
    expect(screen.getByRole('radio', { name: 'Porträt' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Vollbild' })).toBeInTheDocument();
  });
});
