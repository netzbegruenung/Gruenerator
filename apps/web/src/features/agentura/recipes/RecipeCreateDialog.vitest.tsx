/**
 * `RecipeCreateDialog` legt ein Rezept direkt im Projekt an: dieselben Felder
 * wie die Rezept-Seite, „Im Projekt speichern" speichert und teilt ins Projekt,
 * ohne die Projektseite zu verlassen.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RecipeCreateDialog } from './RecipeCreateDialog';

import { axe, renderWithProviders, screen, waitFor } from '@/test-utils';

const save = vi.hoisted(() => vi.fn());
const shareWithGroup = vi.hoisted(() => vi.fn());
const list = vi.hoisted(() => vi.fn());

vi.mock('@gruenerator/shared/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getContractsClient: () => ({ userTextForms: { save, list, share: shareWithGroup } }),
}));

const navigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useNavigate: () => navigate,
}));

const WANN = 'Wann soll der Grünerator es nutzen?';

beforeEach(() => {
  save.mockReset();
  shareWithGroup.mockReset();
  navigate.mockReset();
  list.mockReset().mockResolvedValue({ status: 200, body: { success: true, forms: [] } });
});

describe('RecipeCreateDialog', () => {
  it('speichert, teilt ins Projekt und schließt, ohne zu navigieren', async () => {
    save.mockResolvedValueOnce({
      status: 200,
      body: { success: true, form: { id: 'r1', mention: 'rundbrief', title: 'Rundbrief' } },
    });
    shareWithGroup.mockResolvedValueOnce({ status: 200, body: { success: true } });
    const onOpenChange = vi.fn();
    const { user } = renderWithProviders(
      <RecipeCreateDialog open onOpenChange={onOpenChange} projectId="p1" />
    );

    expect(screen.getByRole('dialog', { name: 'Neues Rezept' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Name'), 'Rundbrief');
    await user.type(screen.getByLabelText('Anleitung'), 'Schreibe kurz und klar.');
    await user.type(
      screen.getByLabelText(WANN),
      'Kurze Rundbriefe. Nutzen, wenn ein Rundbrief entsteht.'
    );
    await user.click(screen.getByRole('button', { name: 'Im Projekt speichern' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(save).toHaveBeenCalledTimes(1);
    expect(shareWithGroup).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('bleibt offen und nennt die Lücken, wenn etwas fehlt', async () => {
    const onOpenChange = vi.fn();
    const { user } = renderWithProviders(
      <RecipeCreateDialog open onOpenChange={onOpenChange} projectId="p1" />
    );

    await user.click(screen.getByRole('button', { name: 'Im Projekt speichern' }));

    expect(screen.getByText('Gib dem Rezept einen Namen.')).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('ist frei von Verstößen gegen die Zugänglichkeit', async () => {
    const { baseElement } = renderWithProviders(
      <RecipeCreateDialog open onOpenChange={() => {}} projectId="p1" />
    );

    await waitFor(async () => {
      expect(await axe(baseElement)).toHaveNoViolations();
    });
  });
});
