/**
 * `RecipeCreatorPage` is the guided recipe creator entry
 * (`/agentura/rezept/neu`): describe → AI draft, or skip straight into an
 * empty shared `RecipeEditor` via "Lieber manuell anlegen?". These tests cover
 * both entry paths plus the start screen's own-recipes grid and a11y.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

import RecipeCreatorPage from './RecipeCreatorPage';

import { useAuthStore } from '@/stores/authStore';
import { axe, renderWithProviders, screen, waitFor } from '@/test-utils';

const draft = vi.hoisted(() => vi.fn());
const list = vi.hoisted(() => vi.fn());

vi.mock('@gruenerator/shared/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getContractsClient: () => ({ userTextForms: { draft, list } }),
}));

function emptyRecipesList() {
  list.mockResolvedValue({ status: 200, body: { forms: [] } });
}

beforeEach(() => {
  draft.mockReset();
  list.mockReset();
  emptyRecipesList();
  useAuthStore.setState({ user: { id: 'u1' } as never });
});

describe('RecipeCreatorPage', () => {
  it('entwirft aus der Beschreibung und öffnet den Editor vorausgefüllt', async () => {
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
    const { user } = renderWithProviders(<RecipeCreatorPage />);

    // The prompt's icon-only submit button carries no accessible name once
    // text is entered (`@gruenerator/ui`, out of this task's scope) — Enter
    // is the input's own submit path (`handleKeyDown` in `AIPromptInput`).
    await user.type(
      screen.getByPlaceholderText('Beschreibe dein neues Rezept...'),
      'Einladung zur Mitgliederversammlung, förmlicher Ton{Enter}'
    );

    await waitFor(() => expect(draft).toHaveBeenCalledTimes(1));
    expect(await screen.findByLabelText('Name')).toHaveValue('Vereinseinladung');
    expect(screen.getByLabelText('@mention')).toHaveValue('vereinseinladung');
    expect(screen.getByLabelText('Beschreibung')).toHaveValue(
      'Einladung zur Mitgliederversammlung'
    );
    expect(screen.getByLabelText('Anleitung')).toHaveValue('Förmlicher Ton, mit Tagesordnung.');
  });

  it('„Lieber manuell anlegen?" öffnet den Editor leer', async () => {
    const { user } = renderWithProviders(<RecipeCreatorPage />);

    await user.click(screen.getByRole('button', { name: 'Lieber manuell anlegen?' }));

    // Ein Formular, keine Tabs: Name und Anleitung stehen gleichzeitig da.
    expect(screen.getByLabelText('Name')).toHaveValue('');
    expect(screen.getByLabelText('Anleitung')).toHaveValue('');
    expect(draft).not.toHaveBeenCalled();
  });

  it('bietet keinen zweiten Einstieg mehr an, der dasselbe täte', async () => {
    renderWithProviders(<RecipeCreatorPage />);

    // „Aus Beispielen anlernen" öffnete denselben leeren Editor wie „manuell",
    // nur auf einem anderen Tab — und die Tabs gibt es nicht mehr.
    expect(
      screen.queryByRole('button', { name: 'Aus Beispielen anlernen' })
    ).not.toBeInTheDocument();
  });

  it('zeigt „Meine Rezepte" nicht, wenn die eigene Liste leer ist', async () => {
    renderWithProviders(<RecipeCreatorPage />);

    await waitFor(() => expect(list).toHaveBeenCalled());
    expect(screen.queryByText('Meine Rezepte')).not.toBeInTheDocument();
  });

  it('zeigt eigene Rezepte unter „Meine Rezepte", wenn welche existieren', async () => {
    list.mockResolvedValue({
      status: 200,
      body: {
        forms: [
          {
            id: 'r1',
            kind: 'custom',
            mention: 'mein-rezept',
            title: 'Mein Rezept',
            description: 'Kurzbeschreibung',
            iconKey: 'PiSparkle',
            sharedFromGroup: null,
          },
        ],
      },
    });
    renderWithProviders(<RecipeCreatorPage />);

    expect(await screen.findByText('Meine Rezepte')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Mein Rezept' })).toBeInTheDocument();
  });

  it('ist frei von Verstößen gegen die Zugänglichkeit', async () => {
    const { container } = renderWithProviders(<RecipeCreatorPage />);

    await waitFor(async () => {
      expect(await axe(container)).toHaveNoViolations();
    });
  });
});
