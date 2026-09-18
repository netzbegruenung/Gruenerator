/**
 * The recipe share dialog. Two things worth a test: changing the visibility
 * actually reaches the API (the whole dialog is a set of write-through
 * controls — nothing here is local state), and the controls carry their
 * labels, which is the one way this dialog differs from its agent sibling.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ShareRecipeModal } from './ShareRecipeModal';

import { axe, render, screen, userEvent, waitFor } from '@/test-utils';

const getShareSettings = vi.hoisted(() => vi.fn());
const setShareMode = vi.hoisted(() => vi.fn());
const setIsPublic = vi.hoisted(() => vi.fn());
const list = vi.hoisted(() => vi.fn());
const listMyGroups = vi.hoisted(() => vi.fn());

vi.mock('@gruenerator/shared/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getContractsClient: () => ({
    userTextForms: { getShareSettings, setShareMode, setIsPublic, list },
    notebookSharing: { listMyGroups },
  }),
}));

function renderModal() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <ShareRecipeModal mention="mein-rezept" open onOpenChange={() => {}} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  // Radix' Select drives its trigger through the Pointer Capture API, which
  // jsdom does not implement — without these three the dropdown never opens.
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};

  getShareSettings.mockReset().mockResolvedValue({
    status: 200,
    body: { share_mode: 'private', is_public: false, public_ownership: null },
  });
  setShareMode.mockReset().mockResolvedValue({
    status: 200,
    body: { share_mode: 'authenticated', is_public: false, public_ownership: null },
  });
  setIsPublic.mockReset().mockResolvedValue({
    status: 200,
    body: { share_mode: 'authenticated', is_public: true, public_ownership: 'owner' },
  });
  list.mockReset().mockResolvedValue({ status: 200, body: { success: true, forms: [] } });
  listMyGroups.mockReset().mockResolvedValue({ status: 200, body: [] });
});

describe('ShareRecipeModal', () => {
  it('schreibt eine geänderte Sichtbarkeit sofort zum Server', async () => {
    renderModal();

    const trigger = await screen.findByLabelText('Sichtbarkeit');
    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole('option', { name: /Mit Anmeldung/ }));

    await waitFor(() =>
      expect(setShareMode).toHaveBeenCalledWith({
        params: { mention: 'mein-rezept' },
        body: { mode: 'authenticated' },
      })
    );
  });

  it('zeigt bei einem 409 den Satz des Servers, nicht eine eigene Fassung davon', async () => {
    setShareMode.mockResolvedValue({
      status: 409,
      body: {
        success: false,
        message: 'Angepasste System-Rezepte lassen sich nicht teilen — nur eigene Rezepte.',
      },
    });
    renderModal();

    const trigger = await screen.findByLabelText('Sichtbarkeit');
    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole('option', { name: /Mit Anmeldung/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Angepasste System-Rezepte lassen sich nicht teilen — nur eigene Rezepte.'
    );
  });

  it('fällt bei einem 500 auf die Sammelzeile zurück', async () => {
    setShareMode.mockResolvedValue({ status: 500, body: { success: false, message: 'boom' } });
    renderModal();

    const trigger = await screen.findByLabelText('Sichtbarkeit');
    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole('option', { name: /Mit Anmeldung/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Die Freigabe konnte nicht geändert werden.'
    );
  });

  it('listet die Eigentumsfrage als gedrückte Schalter', async () => {
    getShareSettings.mockResolvedValue({
      status: 200,
      body: { share_mode: 'authenticated', is_public: true, public_ownership: 'owner' },
    });
    renderModal();

    expect(await screen.findByRole('button', { name: /Ich besitze die Inhalte/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(
      screen.getByRole('button', { name: /Inhalte sind öffentlich verfügbar/ })
    ).toHaveAttribute('aria-pressed', 'false');
  });

  it('hat keine a11y-Verstöße', async () => {
    getShareSettings.mockResolvedValue({
      status: 200,
      body: { share_mode: 'groups', is_public: false, public_ownership: null },
    });
    const { baseElement } = renderModal();
    await screen.findByLabelText('Sichtbarkeit');

    expect(await axe(baseElement)).toHaveNoViolations();
  });
});
