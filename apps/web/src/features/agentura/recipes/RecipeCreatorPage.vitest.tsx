/**
 * `RecipeCreatorPage` (`/projekte/rezept/neu`) opens the shared
 * `RecipeEditor` empty — there is no start screen any more. Only „Als Rezept
 * speichern" under a chat answer still runs an AI draft first, with the answer
 * as the first example.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

import RecipeCreatorPage from './RecipeCreatorPage';

import { useAuthStore } from '@/stores/authStore';
import { axe, renderWithProviders, screen, waitFor } from '@/test-utils';

const draft = vi.hoisted(() => vi.fn());
const locationState = vi.hoisted(() => ({ value: null as unknown }));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useLocation: () => ({ ...(actual.useLocation as () => object)(), state: locationState.value }),
  };
});
const list = vi.hoisted(() => vi.fn());

vi.mock('@gruenerator/shared/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getContractsClient: () => ({ userTextForms: { draft, list } }),
}));

function emptyRecipesList() {
  list.mockResolvedValue({ status: 200, body: { forms: [] } });
}

beforeEach(() => {
  locationState.value = null;
  draft.mockReset();
  list.mockReset();
  emptyRecipesList();
  useAuthStore.setState({ user: { id: 'u1' } as never });
});

describe('RecipeCreatorPage', () => {
  it('öffnet den Editor sofort leer, ohne Startbildschirm und ohne KI-Entwurf', () => {
    renderWithProviders(<RecipeCreatorPage />);

    expect(screen.getByRole('heading', { name: 'Neues Rezept' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('');
    expect(screen.getByLabelText('Anleitung')).toHaveValue('');
    expect(screen.queryByText('Lieber manuell anlegen?')).not.toBeInTheDocument();
    expect(screen.queryByText('Meine Rezepte')).not.toBeInTheDocument();
    expect(draft).not.toHaveBeenCalled();
  });

  it('prefills the draft from an answer', async () => {
    draft.mockResolvedValueOnce({
      status: 200,
      body: {
        success: true,
        spec: {
          title: 'Vereinseinladung',
          mention: 'vereinseinladung',
          description: 'Einladung zur Mitgliederversammlung',
          iconKey: 'PiEnvelope',
          styleBlock: 'Förmlicher Ton, mit Tagesordnung.',
        },
      },
    });
    locationState.value = { fromAnswer: { text: 'Liebe Mitglieder, wir laden herzlich ein.' } };
    renderWithProviders(<RecipeCreatorPage />);

    expect(screen.getByRole('status')).toHaveTextContent('Rezeptentwurf');
    await waitFor(() => expect(draft).toHaveBeenCalledTimes(1));
    const sent = (draft.mock.calls[0]?.[0] as { body: { description: string } }).body.description;
    expect(sent).toContain('Ein Rezept, das Texte wie dieses Beispiel erzeugt.');
    expect(sent).toContain('Liebe Mitglieder, wir laden herzlich ein.');
    expect(sent.length).toBeLessThanOrEqual(4000);
    expect(await screen.findByLabelText('Name')).toHaveValue('Vereinseinladung');
    expect(screen.getByLabelText('Im Chat aufrufen mit')).toHaveValue('vereinseinladung');
    expect(screen.getByLabelText('Wann soll der Grünerator es nutzen?')).toHaveValue(
      'Einladung zur Mitgliederversammlung'
    );
    expect(screen.getByLabelText('Anleitung')).toHaveValue('Förmlicher Ton, mit Tagesordnung.');
    // Die Antwort steht als erstes Beispiel hinter „Aus Beispielen lernen".
    expect(screen.getByRole('button', { name: /^Aus Beispielen lernen · 1/ })).toBeInTheDocument();
  });

  it('opens the editor with the answer as example when the draft fails', async () => {
    draft.mockRejectedValueOnce(new Error('offline'));
    locationState.value = { fromAnswer: { text: 'Liebe Mitglieder, wir laden herzlich ein.' } };
    renderWithProviders(<RecipeCreatorPage />);

    expect(await screen.findByLabelText('Name')).toHaveValue('');
    expect(screen.getByRole('button', { name: /^Aus Beispielen lernen · 1/ })).toBeInTheDocument();
  });

  it('ist frei von Verstößen gegen die Zugänglichkeit', async () => {
    const { container } = renderWithProviders(<RecipeCreatorPage />);

    await waitFor(async () => {
      expect(await axe(container)).toHaveNoViolations();
    });
  });
});
