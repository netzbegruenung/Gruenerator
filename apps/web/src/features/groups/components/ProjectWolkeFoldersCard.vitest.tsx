/**
 * „Wolke-Ordner" (#5945): experimental label, members only see attached folders,
 * admins connect a folder through the contract endpoint.
 */
import { type GroupWolkeFolder } from '@gruenerator/contracts';
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { server } from '../../../test/msw-server';

import { ProjectWolkeFoldersCard } from './ProjectWolkeFoldersCard';

import { axe, renderWithProviders, screen, waitFor } from '@/test-utils';

const LIST = 'http://localhost/api/auth/groups/g1/wolke-folders';

const folder = (over: Partial<GroupWolkeFolder> = {}): GroupWolkeFolder => ({
  id: '11111111-1111-4111-8111-111111111111',
  folderName: 'Material',
  folderPath: '/',
  includeSubfolders: true,
  fileCount: 12,
  pendingCount: 0,
  lastSyncedAt: null,
  lastError: null,
  attachedById: 'u1',
  attachedByName: 'Ada',
  ...over,
});

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

afterEach(() => {
  server.resetHandlers();
});

const list = (folders: GroupWolkeFolder[]) =>
  http.get(LIST, () => HttpResponse.json({ success: true, folders }));

describe('ProjectWolkeFoldersCard', () => {
  it('renders nothing for a member while no folder is attached', async () => {
    let asked = false;
    server.use(
      http.get(LIST, () => {
        asked = true;
        return HttpResponse.json({ success: true, folders: [] });
      })
    );
    const { container } = renderWithProviders(
      <ProjectWolkeFoldersCard groupId="g1" isAdmin={false} archived={false} />
    );
    await waitFor(() => expect(asked).toBe(true));
    expect(container).toBeEmptyDOMElement();
  });

  it('shows attached folders to members, labelled experimental, without admin actions', async () => {
    server.use(list([folder()]));
    const { container } = renderWithProviders(
      <ProjectWolkeFoldersCard groupId="g1" isAdmin={false} archived={false} />
    );
    expect(await screen.findByText('Material')).toBeInTheDocument();
    expect(screen.getByText('Experimentell')).toBeInTheDocument();
    expect(screen.getByText(/12 Dateien/)).toBeInTheDocument();
    expect(screen.getByText('über die Wolke von Ada')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ordner/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Aktionen für/ })).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows the sync error instead of the counts', async () => {
    server.use(list([folder({ lastError: 'Der Freigabelink gilt nicht mehr.' })]));
    renderWithProviders(<ProjectWolkeFoldersCard groupId="g1" isAdmin={false} archived={false} />);
    expect(await screen.findByText('Der Freigabelink gilt nicht mehr.')).toBeInTheDocument();
    expect(screen.queryByText(/12 Dateien/)).not.toBeInTheDocument();
  });

  it('lets an admin connect a folder by share link', async () => {
    let sent: unknown = null;
    server.use(
      list([]),
      http.post(LIST, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({
          success: true,
          folder: folder({ fileCount: 2 }),
          summary: { imported: 2, removed: 0, pending: 0, skipped: 0, failed: 0 },
        });
      })
    );
    const onSuccess = vi.fn();
    const { user } = renderWithProviders(
      <ProjectWolkeFoldersCard groupId="g1" isAdmin archived={false} onSuccessMessage={onSuccess} />
    );
    await user.click(await screen.findByRole('button', { name: 'Ordner' }));
    const input = screen.getByLabelText('Freigabelink des Ordners');
    await user.type(input, 'keinlink');
    expect(screen.getByText(/sieht nicht nach einem Nextcloud-Freigabelink/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verbinden' })).toBeDisabled();

    await user.clear(input);
    await user.type(input, 'https://wolke.netzbegruenung.de/s/AbCdEf123');
    await user.click(screen.getByRole('button', { name: 'Verbinden' }));

    await waitFor(() =>
      expect(sent).toEqual({
        url: 'https://wolke.netzbegruenung.de/s/AbCdEf123',
        includeSubfolders: true,
      })
    );
    await waitFor(() =>
      expect(onSuccess).toHaveBeenCalledWith(expect.stringMatching(/2 eingelesen/))
    );
  });

  it('offers no new folder in an archived project', async () => {
    server.use(list([folder()]));
    renderWithProviders(<ProjectWolkeFoldersCard groupId="g1" isAdmin archived />);
    expect(
      await screen.findByText(/Pausiert, solange das Projekt archiviert ist/)
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ordner' })).not.toBeInTheDocument();
  });
});
