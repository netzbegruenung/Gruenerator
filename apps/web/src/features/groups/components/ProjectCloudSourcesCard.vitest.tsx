/**
 * „Wolke & Drive" (#5945): experimental label, members only see attached
 * sources, admins connect a Wolke folder by link or pick Drive files.
 */
import { type GroupCloudSource } from '@gruenerator/contracts';
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { server } from '../../../test/msw-server';

import { ProjectCloudSourcesCard } from './ProjectCloudSourcesCard';

import { axe, renderWithProviders, screen, waitFor } from '@/test-utils';

const pickGoogleFiles = vi.hoisted(() => vi.fn());
vi.mock('@gruenerator/chat/lib/googlePicker', () => ({ pickGoogleFiles }));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('@gruenerator/ui', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  toast,
}));

const BASE = 'http://localhost/api/auth/groups/g1/cloud-sources';
const PICKER = 'http://localhost/api/connections/google/picker';

const source = (over: Partial<GroupCloudSource> = {}): GroupCloudSource => ({
  id: '11111111-1111-4111-8111-111111111111',
  provider: 'wolke',
  name: 'Material',
  includeSubfolders: true,
  fileCount: 12,
  pendingCount: 0,
  lastSyncedAt: null,
  lastError: null,
  attachedById: 'u1',
  attachedByName: 'Ada',
  ...over,
});

const summary = { imported: 2, removed: 0, pending: 0, skipped: 0, failed: 0 };

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

afterEach(() => {
  server.resetHandlers();
  pickGoogleFiles.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
});

const list = (sources: GroupCloudSource[]) =>
  http.get(BASE, () => HttpResponse.json({ success: true, sources }));

describe('ProjectCloudSourcesCard', () => {
  it('renders nothing for a member while no source is attached', async () => {
    let asked = false;
    server.use(
      http.get(BASE, () => {
        asked = true;
        return HttpResponse.json({ success: true, sources: [] });
      })
    );
    const { container } = renderWithProviders(
      <ProjectCloudSourcesCard groupId="g1" isAdmin={false} archived={false} />
    );
    await waitFor(() => expect(asked).toBe(true));
    expect(container).toBeEmptyDOMElement();
  });

  it('shows sources to members, labelled experimental, without admin actions', async () => {
    server.use(
      list([
        source(),
        source({ id: 'd', provider: 'google-drive', name: 'Google Drive', fileCount: 1 }),
      ])
    );
    const { container } = renderWithProviders(
      <ProjectCloudSourcesCard groupId="g1" isAdmin={false} archived={false} />
    );
    expect(await screen.findByText('Material')).toBeInTheDocument();
    expect(screen.getByText('Experimentell')).toBeInTheDocument();
    expect(screen.getByText(/12 Dateien/)).toBeInTheDocument();
    expect(screen.getByText(/^1 Datei/)).toBeInTheDocument();
    expect(screen.getByText('über die Wolke von Ada')).toBeInTheDocument();
    expect(screen.getByText('über das Google Drive von Ada')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Quelle/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Aktionen für/ })).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows the sync error instead of the counts', async () => {
    server.use(list([source({ lastError: 'Der Freigabelink gilt nicht mehr.' })]));
    renderWithProviders(<ProjectCloudSourcesCard groupId="g1" isAdmin={false} archived={false} />);
    expect(await screen.findByText('Der Freigabelink gilt nicht mehr.')).toBeInTheDocument();
    expect(screen.queryByText(/12 Dateien/)).not.toBeInTheDocument();
  });

  it('lets an admin connect a Wolke folder by share link', async () => {
    let sent: unknown = null;
    server.use(
      list([]),
      http.post(`${BASE}/wolke`, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ success: true, source: source({ fileCount: 2 }), summary });
      })
    );
    const onSuccess = toast.success;
    const { user } = renderWithProviders(
      <ProjectCloudSourcesCard groupId="g1" isAdmin archived={false} />
    );
    await user.click(await screen.findByRole('button', { name: 'Quelle' }));
    await user.click(await screen.findByRole('menuitem', { name: /Wolke-Ordner/ }));
    const input = await screen.findByLabelText('Freigabelink des Ordners');
    await user.type(input, 'keinlink');
    expect(screen.getByText(/sieht nicht nach einem Nextcloud-Freigabelink/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verbinden' })).toBeDisabled();

    await user.clear(input);
    await user.type(input, 'https://wolke.netzbegruenung.de/s/AbCdEf123');
    await user.type(screen.getByLabelText(/Name im Projekt/), 'Protokolle');
    await user.click(screen.getByRole('button', { name: 'Verbinden' }));

    await waitFor(() =>
      expect(sent).toEqual({
        url: 'https://wolke.netzbegruenung.de/s/AbCdEf123',
        includeSubfolders: true,
        name: 'Protokolle',
      })
    );
    await waitFor(() =>
      expect(onSuccess).toHaveBeenCalledWith(expect.stringMatching(/2 eingelesen/))
    );
  });

  it('adds the files picked in Google Drive', async () => {
    let sent: unknown = null;
    pickGoogleFiles.mockResolvedValue([
      { id: 'abc', name: 'Plan.pdf', mimeType: 'application/pdf' },
    ]);
    server.use(
      list([]),
      http.get(PICKER, () =>
        HttpResponse.json({ success: true, accessToken: 't', apiKey: 'k', appId: '1' })
      ),
      http.post(`${BASE}/google-drive`, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({
          success: true,
          source: source({ provider: 'google-drive', name: 'Google Drive', fileCount: 1 }),
          summary: { ...summary, imported: 1 },
        });
      })
    );
    const onSuccess = toast.success;
    const { user } = renderWithProviders(
      <ProjectCloudSourcesCard groupId="g1" isAdmin archived={false} />
    );
    await user.click(await screen.findByRole('button', { name: 'Quelle' }));
    await user.click(await screen.findByRole('menuitem', { name: /Google Drive/ }));

    await waitFor(() =>
      expect(sent).toEqual({
        files: [{ id: 'abc', name: 'Plan.pdf', mimeType: 'application/pdf' }],
      })
    );
    expect(pickGoogleFiles).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 't', apiKey: 'k', appId: '1' })
    );
    await waitFor(() =>
      expect(onSuccess).toHaveBeenCalledWith(expect.stringMatching(/1 eingelesen/))
    );
  });

  it('asks to connect Google Drive when there is no connection', async () => {
    server.use(
      list([]),
      http.get(PICKER, () =>
        HttpResponse.json(
          { success: false, error: 'Konto nicht verbunden oder Zugang abgelaufen.' },
          { status: 403 }
        )
      )
    );
    const onError = toast.error;
    const { user } = renderWithProviders(
      <ProjectCloudSourcesCard groupId="g1" isAdmin archived={false} />
    );
    await user.click(await screen.findByRole('button', { name: 'Quelle' }));
    await user.click(await screen.findByRole('menuitem', { name: /Google Drive/ }));
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(pickGoogleFiles).not.toHaveBeenCalled();
  });

  it('offers nothing new in an archived project', async () => {
    server.use(list([source()]));
    renderWithProviders(<ProjectCloudSourcesCard groupId="g1" isAdmin archived />);
    expect(
      await screen.findByText(/Pausiert, solange das Projekt archiviert ist/)
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Quelle' })).not.toBeInTheDocument();
  });
});
