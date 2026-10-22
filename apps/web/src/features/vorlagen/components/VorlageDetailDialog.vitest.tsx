import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { server } from '../../../test/msw-server';

import { VorlageDetailDialog } from './VorlageDetailDialog';

import { useAuthStore } from '@/stores/authStore';
import { axe, renderWithProviders } from '@/test-utils';

const ownTemplates = vi.hoisted(() => ({ data: [] as Array<{ id: string }> }));
vi.mock('@/features/auth/hooks/useProfileData', () => ({
  useUserTemplates: () => ({ query: ownTemplates }),
}));

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

const URL = 'https://gruenerator.eu/studio/vorlage/de-zitat';
const pages = [
  { src: '/a.png', alt: 'Seite 1 von 2' },
  { src: '/b.png', alt: 'Seite 2 von 2' },
];

function renderDialog(props: Partial<Parameters<typeof VorlageDetailDialog>[0]> = {}) {
  return renderWithProviders(
    <VorlageDetailDialog
      onClose={vi.fn()}
      title="Zitat"
      meta="Zitat · Deutschland"
      pages={pages}
      share={{ title: 'Zitat', url: URL }}
      {...props}
    />
  );
}

describe('VorlageDetailDialog', () => {
  it('opens the share dialog from Teilen', async () => {
    renderDialog();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Teilen' }));
    expect(await screen.findByRole('heading', { name: 'Vorlage teilen' })).toBeInTheDocument();
    expect(screen.getByDisplayValue(URL)).toBeInTheDocument();
  });

  it('has no Teilen without anything to share', () => {
    renderDialog({ share: undefined });
    expect(screen.queryByRole('button', { name: 'Teilen' })).not.toBeInTheDocument();
  });

  it('shows every page and previews the one clicked, not the one hovered', async () => {
    renderDialog();
    expect(screen.getByRole('img')).toHaveAttribute('alt', 'Seite 1 von 2');
    expect(screen.getByRole('button', { name: 'Seite 1 von 2 anzeigen' })).toHaveAttribute(
      'aria-current',
      'true'
    );
    const user = userEvent.setup();
    const second = screen.getByRole('button', { name: 'Seite 2 von 2 anzeigen' });
    await user.hover(second);
    expect(screen.getByRole('img')).toHaveAttribute('alt', 'Seite 1 von 2');
    await user.click(second);
    expect(screen.getByRole('img')).toHaveAttribute('alt', 'Seite 2 von 2');
    expect(await axe(screen.getByRole('dialog'))).toHaveNoViolations();
  });

  it('has no page strip for a single page', () => {
    renderDialog({ pages: pages.slice(0, 1) });
    expect(screen.queryByRole('group', { name: 'Seiten' })).not.toBeInTheDocument();
  });

  it('disables Like and Merken when signed out', async () => {
    renderDialog();
    expect(screen.getByRole('button', { name: 'Liken' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Merken' })).toBeDisabled();
    expect(await axe(screen.getByRole('dialog'))).toHaveNoViolations();
  });

  it("carries the comments, and only the Vorlage's owner deletes other people's", async () => {
    useAuthStore.setState({ isAuthenticated: true, user: { id: 'me' } as never });
    server.use(
      http.get('http://localhost/api/comments/template/t1', () =>
        HttpResponse.json({
          success: true,
          reactions: [],
          comments: [
            {
              id: 'c1',
              entityType: 'template',
              entityId: 't1',
              parentId: null,
              userId: 'someone-else',
              authorName: 'Anna Beispiel',
              body: 'Tolle Vorlage',
              createdAt: '2026-10-13T10:00:00Z',
              reactions: [],
            },
          ],
        })
      )
    );
    ownTemplates.data = [];
    const { unmount } = renderDialog({ templateId: 't1' });
    expect(await screen.findByText('Tolle Vorlage')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Kommentar löschen' })).toBeNull();
    unmount();

    ownTemplates.data = [{ id: 't1' }];
    renderDialog({ templateId: 't1' });
    await screen.findByText('Tolle Vorlage');
    expect(screen.getByRole('button', { name: 'Kommentar löschen' })).toBeInTheDocument();
    expect(await axe(screen.getByRole('dialog'))).toHaveNoViolations();
  });
});
