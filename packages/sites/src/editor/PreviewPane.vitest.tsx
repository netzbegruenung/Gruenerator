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
  usePreviewSelection: () => {},
  usePreviewHighlight: () => {},
  usePreviewInsertMark: () => {},
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

function published(): SiteData {
  return {
    id: 's1',
    subdomain: 'anna',
    legal: LEGAL,
    published_snapshot: liveSnapshot(),
  } as SiteData;
}

describe('PreviewPane', () => {
  it('edits the draft by default', () => {
    renderWithDraft(
      <PreviewPane site={published()} view="draft" onViewChange={() => {}} device="desktop" />
    );
    expect(screen.getByTestId('frame')).toHaveTextContent('Mustermensch');
    expect(screen.queryByText('Du siehst den Live-Stand.')).toBeNull();
  });

  it('shows the published snapshot unedited, with a way back to the draft', async () => {
    const onViewChange = vi.fn();
    const { user } = renderWithDraft(
      <PreviewPane site={published()} view="live" onViewChange={onViewChange} device="desktop" />
    );
    expect(screen.getByTestId('frame')).toHaveTextContent('Alter Stand');
    expect(screen.getByTestId('frame')).toHaveAttribute('data-title', 'Live-Stand der Website');
    await user.click(screen.getByRole('button', { name: 'Zurück zum Entwurf' }));
    expect(onViewChange).toHaveBeenCalledWith('draft');
  });

  it('falls back to the draft when there is no published snapshot', () => {
    renderWithDraft(
      <PreviewPane
        site={{ ...published(), published_snapshot: null }}
        view="live"
        onViewChange={() => {}}
        device="desktop"
      />
    );
    expect(screen.getByTestId('frame')).toHaveTextContent('Mustermensch');
  });

  it('narrows the canvas to the chosen device', () => {
    const { container } = renderWithDraft(
      <PreviewPane site={published()} view="draft" onViewChange={() => {}} device="phone" />
    );
    expect(container.querySelector('[data-device="phone"]')).toHaveStyle({ width: '375px' });
  });
});
