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
      onPickExisting={() => {}}
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
  it('team: one page — chats on top, Austausch below, new post behind the plus', async () => {
    const { user, container } = render();
    expect(screen.getByText('ÜBERSICHT')).toBeInTheDocument();
    expect(screen.getByText('SEITENSPALTE')).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Austausch' })).toBeInTheDocument();
    // Posts stand expanded; a share without a note stays in Wissen.
    expect(screen.getByText('Bitte lesen.')).toBeInTheDocument();
    expect(screen.queryByText('Ohne Notiz')).not.toBeInTheDocument();
    // No search field and no post box until someone asks for them.
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.queryByText(/Schreib etwas an das Projekt/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Neuer Beitrag' }));
    expect(screen.getByText(/Schreib etwas an das Projekt/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Einklappen' }));
    expect(screen.queryByText('Bitte lesen.')).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('the project menu’s search signal opens a focused search field', async () => {
    const { user, rerender } = render();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    rerender(
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
        onPickExisting={() => {}}
        actions={null}
        onUseTemplate={() => {}}
        cloningId={null}
        overviewMain={<p>ÜBERSICHT</p>}
        sidebar={() => <p>SEITENSPALTE</p>}
        searchSignal={1}
      />
    );
    const box = await screen.findByRole('searchbox', { name: 'Im Austausch suchen' });
    expect(box).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Suche schließen' }));
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });

  it('“Im Austausch besprechen” brings the shared item into Austausch', async () => {
    const { user } = render();
    await user.click(screen.getByRole('button', { name: 'besprechen' }));
    expect(await screen.findByText('Ohne Notiz')).toBeInTheDocument();
  });

  it('deep link ?beitrag=<shareId> shows that item, even without a note', () => {
    render({}, '/projekte/g1?beitrag=s-d1');
    expect(screen.getByText('Ohne Notiz')).toBeInTheDocument();
  });

  it('only you in the project: no Austausch', () => {
    render({ hasAustausch: false });
    expect(screen.getByText('ÜBERSICHT')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Austausch' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'besprechen' })).not.toBeInTheDocument();
  });

  it('system project: Austausch without a post button when sharing is not allowed', () => {
    render({ isSystem: true, onPickExisting: null, isAdmin: false });
    expect(screen.getByRole('heading', { name: 'Austausch' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Neuer Beitrag' })).not.toBeInTheDocument();
  });
});
