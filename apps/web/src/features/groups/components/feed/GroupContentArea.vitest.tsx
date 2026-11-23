import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { type GroupFeedItem } from '@gruenerator/shared/groups';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeAll, describe, expect, it } from 'vitest';

import { server } from '../../../../test/msw-server';
import { axe, renderWithProviders } from '../../../../test-utils';

import { GroupContentArea } from './GroupContentArea';

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
  server.use(
    http.get('http://localhost/api/auth/groups/g1/shares/:shareId/comments', () =>
      HttpResponse.json({ success: true, comments: [] })
    )
  );
});

const meta = (shareId: string, note: string | null = null) => ({
  shareId,
  note,
  pinnedAt: null,
  pinnedByName: null,
  commentCount: 0,
  reactions: [],
});

const item = (id: string, title: string, note: string | null): GroupFeedItem => ({
  key: `documents:${id}`,
  id,
  contentType: 'documents',
  kind: 'document',
  title,
  excerpt: null,
  thumbnailUrl: null,
  slug: null,
  sharedByName: 'Aileen Lorenz',
  sharedById: 'u2',
  sharedAt: '2026-11-10T10:00:00Z',
  share: meta(`s-${id}`, note),
  projectWrite: null,
  post: null,
});

const items = [item('d1', 'Ohne Notiz', null), item('d2', 'Mit Notiz', 'Bitte lesen.')];

function render(props: Partial<React.ComponentProps<typeof GroupContentArea>> = {}, route = '/') {
  return renderWithProviders(
    <GroupContentArea
      groupId="g1"
      groupName="Team"
      items={items}
      isLoading={false}
      isAdmin
      hasAustausch
      isSystem={false}
      currentUserId="me"
      currentUserName="Moritz"
      members={[]}
      onOpenShare={() => {}}
      actions={null}
      onUseTemplate={() => {}}
      cloningId={null}
      overviewMain={<p>ÜBERSICHT</p>}
      sidebar={({ onDiscuss }) => (
        <div>
          <p>SEITENSPALTE</p>
          {onDiscuss && (
            <button type="button" onClick={() => onDiscuss(items[0]!)}>
              besprechen
            </button>
          )}
        </div>
      )}
      {...props}
    />,
    { route }
  );
}

describe('GroupContentArea', () => {
  it('team: opens on the overview, the post box lives only in Austausch', async () => {
    const { user, container } = render();
    expect(screen.getByText('ÜBERSICHT')).toBeInTheDocument();
    expect(screen.getByText('SEITENSPALTE')).toBeInTheDocument();
    expect(screen.queryByText(/Schreib etwas an das Projekt/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Austausch' }));
    expect(screen.getByText(/Schreib etwas an das Projekt/)).toBeInTheDocument();
    // The side column stays in place; the feed is a row list, a click opens the full card.
    expect(screen.getByText('SEITENSPALTE')).toBeInTheDocument();
    expect(screen.queryByText('ÜBERSICHT')).not.toBeInTheDocument();
    expect(screen.queryByText('Ohne Notiz')).not.toBeInTheDocument();
    expect(screen.queryByText('Bitte lesen.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Mit Notiz/ }));
    expect(screen.getByText('Bitte lesen.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Einklappen' }));
    expect(screen.queryByText('Bitte lesen.')).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('“Im Austausch besprechen” switches tab and shows the shared item', async () => {
    const { user } = render();
    await user.click(screen.getByRole('button', { name: 'besprechen' }));
    expect(await screen.findByText('Ohne Notiz')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Austausch' })).toHaveAttribute('aria-selected', 'true');
  });

  it('deep link ?beitrag=<shareId> opens Austausch with that item, even without a note', () => {
    render({}, '/projekte/g1?beitrag=s-d1');
    expect(screen.getByRole('tab', { name: 'Austausch' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Ohne Notiz')).toBeInTheDocument();
  });

  it('only you in the project: no tabs, no Austausch', () => {
    render({ hasAustausch: false });
    expect(screen.getByText('ÜBERSICHT')).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'besprechen' })).not.toBeInTheDocument();
  });

  it('system project: opens on Austausch; no post box without share rights', () => {
    render({ isSystem: true, onOpenShare: null, isAdmin: false });
    expect(screen.getByRole('tab', { name: 'Austausch' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText(/Schreib etwas an das Projekt/)).not.toBeInTheDocument();
  });
});
