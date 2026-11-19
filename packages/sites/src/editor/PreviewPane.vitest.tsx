import { buildSiteSnapshot, siteDraftToSnapshotSource } from '@gruenerator/contracts';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../preview/SitePreviewFrame', () => ({
  SitePreviewFrame: ({ snapshot, title }: { snapshot: { site_title: string }; title: string }) => (
    <div data-testid="frame" data-title={title}>
      {snapshot.site_title}
    </div>
  ),
}));
vi.mock('../SitesContext', () => ({
  useAuth: () => ({ user: { id: 'u1', locale: 'de-DE' } }),
}));
vi.mock('../preview/usePreviewInteractions', () => ({
  usePreviewClickToEdit: () => {},
  usePreviewScrollSync: () => {},
  usePreviewHighlight: () => {},
}));

import { BASE_DRAFT } from '../draft/testDoc';
import { type SiteData } from '../hooks/useSite';
import { renderWithDraft } from '../test/renderWithDraft';

import { PreviewPane } from './SiteEditor';

const LEGAL = {
  name: 'Anna',
  street: 'Weg 1',
  postal_code: '10115',
  city: 'Berlin',
  email: 'a@example.org',
};

function liveSnapshot() {
  const built = buildSiteSnapshot(
    siteDraftToSnapshotSource({ ...BASE_DRAFT, site_title: 'Alter Stand' }, LEGAL),
    'de-DE'
  );
  if (!built.ok) throw new Error('fixture invalid');
  return built.snapshot;
}

describe('PreviewPane', () => {
  it('has no toggle without a published snapshot', () => {
    renderWithDraft(
      <PreviewPane
        site={{ id: 's1', subdomain: 'anna', legal: LEGAL, published_snapshot: null } as SiteData}
      />
    );
    expect(screen.queryByRole('radio', { name: 'Live-Stand' })).toBeNull();
    expect(screen.getByTestId('frame')).toHaveTextContent('Mustermensch');
  });

  it('shows the published snapshot unedited under "Live-Stand" and the draft under "Entwurf"', async () => {
    const { user } = renderWithDraft(
      <PreviewPane
        site={
          {
            id: 's1',
            subdomain: 'anna',
            legal: LEGAL,
            published_snapshot: liveSnapshot(),
          } as SiteData
        }
      />
    );
    expect(screen.getByTestId('frame')).toHaveTextContent('Mustermensch');
    await user.click(screen.getByRole('radio', { name: 'Live-Stand' }));
    expect(screen.getByTestId('frame')).toHaveTextContent('Alter Stand');
    expect(screen.getByTestId('frame')).toHaveAttribute('data-title', 'Live-Stand der Website');
    await user.click(screen.getByRole('radio', { name: 'Entwurf' }));
    expect(screen.getByTestId('frame')).toHaveTextContent('Mustermensch');
  });
});
