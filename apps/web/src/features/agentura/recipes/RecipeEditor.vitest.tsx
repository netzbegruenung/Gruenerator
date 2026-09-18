/**
 * `RecipeEditor` is the create/edit surface for one recipe ("Rezept") — same
 * shape as `AgentEditor`, but for Agentura recipes. These tests cover the
 * behaviours the brief calls out: form state survives a tab switch, the Save
 * button gates on the required fields, a successful save PUTs the payload
 * (description/iconKey included) and navigates, and a 409 (mention already
 * taken) surfaces under the mention field on the Grundlagen tab rather than as
 * a banner.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import RecipeEditor from './RecipeEditor';
import { EMPTY_RECIPE_FORM, type RecipeFormState } from './recipeFormState';

import { axe, renderWithProviders, screen, waitFor } from '@/test-utils';

const save = vi.hoisted(() => vi.fn());

vi.mock('@gruenerator/shared/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getContractsClient: () => ({ userTextForms: { save } }),
}));

const navigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useNavigate: () => navigate,
}));

function customCreateForm(over: Partial<RecipeFormState> = {}): RecipeFormState {
  return { ...EMPTY_RECIPE_FORM, ...over };
}

async function fillTitleAndInstruction(
  user: ReturnType<typeof renderWithProviders>['user'],
  title: string,
  instruction: string
) {
  await user.type(screen.getByLabelText('Name'), title);
  await user.click(screen.getByRole('tab', { name: 'Anleitung' }));
  await user.type(screen.getByLabelText('Anleitung'), instruction);
}

beforeEach(() => {
  save.mockReset();
  navigate.mockReset();
});

describe('RecipeEditor', () => {
  it('behält getippten Zustand über einen Tab-Wechsel hinweg', async () => {
    const { user } = renderWithProviders(
      <RecipeEditor mode="create" initialState={customCreateForm()} />
    );

    await fillTitleAndInstruction(user, 'Mein Testrezept', 'Schreibe kurz und klar.');
    await user.click(screen.getByRole('tab', { name: 'Grundlagen' }));

    expect(screen.getByLabelText('Name')).toHaveValue('Mein Testrezept');

    await user.click(screen.getByRole('tab', { name: 'Anleitung' }));
    expect(screen.getByLabelText('Anleitung')).toHaveValue('Schreibe kurz und klar.');
  });

  it('sperrt Speichern, bis Name und Anleitung ausgefüllt sind', async () => {
    const { user } = renderWithProviders(
      <RecipeEditor mode="create" initialState={customCreateForm()} />
    );

    expect(screen.getByRole('button', { name: 'Speichern' })).toBeDisabled();

    await user.type(screen.getByLabelText('Name'), 'Mein Testrezept');
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeDisabled();

    await user.click(screen.getByRole('tab', { name: 'Anleitung' }));
    await user.type(screen.getByLabelText('Anleitung'), 'Schreibe kurz und klar.');

    expect(screen.getByRole('button', { name: 'Speichern' })).toBeEnabled();
  });

  it('speichert erfolgreich mit Beschreibung/Icon und navigiert zur Detailseite', async () => {
    save.mockResolvedValueOnce({
      status: 200,
      body: {
        success: true,
        form: { id: 'r1', mention: 'mein-testrezept', title: 'Mein Testrezept' },
      },
    });
    const { user } = renderWithProviders(
      <RecipeEditor mode="create" initialState={customCreateForm()} />
    );

    await user.type(screen.getByLabelText('Name'), 'Mein Testrezept');
    await user.type(screen.getByLabelText('Beschreibung'), 'Kurzbeschreibung');
    await user.click(screen.getByRole('tab', { name: 'Anleitung' }));
    await user.type(screen.getByLabelText('Anleitung'), 'Schreibe kurz und klar.');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const call = save.mock.calls[0]?.[0] as {
      params: { mention: string };
      body: Record<string, unknown>;
    };
    expect(call.params).toEqual({ mention: 'mein-testrezept' });
    expect(call.body.description).toBe('Kurzbeschreibung');
    expect(call.body.iconKey).toBe(EMPTY_RECIPE_FORM.iconKey);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/agentura/rezept/mein-testrezept'));
  });

  it('zeigt einen 409 unter dem Mention-Feld statt als Banner', async () => {
    save.mockResolvedValueOnce({
      status: 409,
      body: { success: false, message: 'Diese Mention ist bereits vergeben.' },
    });
    const { user } = renderWithProviders(
      <RecipeEditor mode="create" initialState={customCreateForm()} />
    );

    await fillTitleAndInstruction(user, 'Mein Testrezept', 'Schreibe kurz und klar.');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(await screen.findByText('Diese Mention ist bereits vergeben.')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Grundlagen', selected: true })).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('ist frei von Verstößen gegen die Zugänglichkeit', async () => {
    const { container } = renderWithProviders(
      <RecipeEditor mode="create" initialState={customCreateForm()} />
    );

    await waitFor(async () => {
      expect(await axe(container)).toHaveNoViolations();
    });
  });
});
