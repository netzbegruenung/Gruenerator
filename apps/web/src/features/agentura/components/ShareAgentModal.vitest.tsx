/**
 * The agent share dialog. Before it shared a panel with the recipe one it
 * showed no error at all, and its link was whatever URL the owner happened to
 * be on — usually the identifier, which is unique only per owner.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ShareAgentModal } from './ShareAgentModal';

import { render, screen, userEvent, waitFor } from '@/test-utils';

const getShareSettings = vi.hoisted(() => vi.fn());
const listGroupShares = vi.hoisted(() => vi.fn());
const addGroupShare = vi.hoisted(() => vi.fn());
const setShareMode = vi.hoisted(() => vi.fn());
const setIsPublic = vi.hoisted(() => vi.fn());
const listMyGroups = vi.hoisted(() => vi.fn());

vi.mock('@gruenerator/shared/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getContractsClient: () => ({
    userAgentsSharing: {
      getShareSettings,
      listGroupShares,
      addGroupShare,
      setShareMode,
      setIsPublic,
    },
    notebookSharing: { listMyGroups },
  }),
}));

const AGENT = { id: '6f1c2d3e-0000-4000-8000-000000000001', identifier: 'klima' };

function renderModal() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <ShareAgentModal agent={AGENT} open onOpenChange={() => {}} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};

  getShareSettings.mockReset().mockResolvedValue({
    status: 200,
    body: { share_mode: 'groups', audience: 'de-DE', is_public: false, public_ownership: null },
  });
  listGroupShares.mockReset().mockResolvedValue({ status: 200, body: [] });
  listMyGroups
    .mockReset()
    .mockResolvedValue({ status: 200, body: [{ id: 'g1', name: 'KV Köln' }] });
  addGroupShare.mockReset();
  setShareMode.mockReset().mockResolvedValue({ status: 200, body: { success: true } });
  setIsPublic.mockReset().mockResolvedValue({ status: 200, body: { success: true } });
});

describe('ShareAgentModal', () => {
  it('spricht von Projekten, nicht von Gruppen', async () => {
    renderModal();
    expect(await screen.findByText('Projekte')).toBeInTheDocument();
    expect(screen.queryByText(/Gruppe/)).not.toBeInTheDocument();
  });

  it('zeigt den Satz des Servers, wenn das Projekt das Teilen nicht erlaubt', async () => {
    addGroupShare.mockResolvedValue({
      status: 403,
      body: { error: 'Mit diesem Projekt darfst du nicht teilen.' },
    });
    renderModal();

    await userEvent.click(await screen.findByLabelText('Projekt hinzufügen'));
    await userEvent.click(await screen.findByRole('option', { name: 'KV Köln' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Mit diesem Projekt darfst du nicht teilen.'
    );
  });

  it('lässt einen englischen 500er-Text nicht durch', async () => {
    addGroupShare.mockResolvedValue({ status: 500, body: { error: 'Internal server error' } });
    renderModal();

    await userEvent.click(await screen.findByLabelText('Projekt hinzufügen'));
    await userEvent.click(await screen.findByRole('option', { name: 'KV Köln' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Die Freigabe konnte nicht geändert werden.'
    );
  });

  it('listet erst nach der Eigentumsfrage', async () => {
    renderModal();

    await userEvent.click(await screen.findByRole('switch', { name: /Im Marktplatz/ }));
    expect(setIsPublic).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /Ich besitze die Inhalte/ }));

    await waitFor(() =>
      expect(setIsPublic).toHaveBeenCalledWith({
        params: { identifier: 'klima' },
        body: { is_public: true, public_ownership: 'owner' },
      })
    );
    expect(setShareMode).toHaveBeenCalledWith({
      params: { identifier: 'klima' },
      body: { mode: 'authenticated' },
    });
  });

  it('teilt den Link über die uuid, nicht über den identifier', async () => {
    renderModal();
    expect(
      await screen.findByDisplayValue(/\/agentura\/agent\/6f1c2d3e-0000-4000-8000-000000000001$/)
    ).toBeInTheDocument();
  });
});
