/**
 * `RecipeDialog` legt ein Rezept direkt im Projekt an oder bearbeitet ein
 * eigenes: dieselben Felder wie die Rezept-Seite, ohne die Projektseite zu
 * verlassen. Anlegen teilt gleich ins Projekt, Bearbeiten speichert nur.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RecipeDialog } from './RecipeDialog';

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

describe('RecipeDialog', () => {
  it('speichert, teilt ins Projekt und schließt, ohne zu navigieren', async () => {
    save.mockResolvedValueOnce({
      status: 200,
      body: { success: true, form: { id: 'r1', mention: 'rundbrief', title: 'Rundbrief' } },
    });
    shareWithGroup.mockResolvedValueOnce({ status: 200, body: { success: true } });
    const onOpenChange = vi.fn();
    const { user } = renderWithProviders(
      <RecipeDialog open onOpenChange={onOpenChange} projectId="p1" />
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
      <RecipeDialog open onOpenChange={onOpenChange} projectId="p1" />
    );

    await user.click(screen.getByRole('button', { name: 'Im Projekt speichern' }));

    expect(screen.getByText('Gib dem Rezept einen Namen.')).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('ist frei von Verstößen gegen die Zugänglichkeit', async () => {
    const { baseElement } = renderWithProviders(
      <RecipeDialog open onOpenChange={() => {}} projectId="p1" />
    );

    await waitFor(async () => {
      expect(await axe(baseElement)).toHaveNoViolations();
    });
  });

  it('bearbeitet das eigene Rezept und speichert ohne erneut zu teilen', async () => {
    list.mockResolvedValue({
      status: 200,
      body: {
        success: true,
        forms: [
          {
            id: 'r1',
            kind: 'custom',
            mention: 'rundbrief',
            title: 'Rundbrief',
            description: 'Kurze Rundbriefe. Nutzen, wenn ein Rundbrief entsteht.',
            styleBlock: 'Schreibe kurz.',
            examples: [],
            iconKey: 'PiSparkle',
            category: null,
            textType: null,
            sharedFromGroup: null,
          },
        ],
      },
    });
    save.mockResolvedValueOnce({
      status: 200,
      body: { success: true, form: { id: 'r1', mention: 'rundbrief', title: 'Rundbrief neu' } },
    });
    const onOpenChange = vi.fn();
    const { user } = renderWithProviders(
      <RecipeDialog open onOpenChange={onOpenChange} projectId="p1" mention="rundbrief" />
    );

    expect(await screen.findByLabelText('Name')).toHaveValue('Rundbrief');
    expect(screen.getByRole('dialog', { name: 'Rezept bearbeiten' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Name'), ' neu');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    const call = save.mock.calls[0]?.[0] as { params: { mention: string } };
    expect(call.params).toEqual({ mention: 'rundbrief' });
    expect(shareWithGroup).not.toHaveBeenCalled();
  });

  it('öffnet kein Formular für ein Rezept, das der Person nicht gehört', async () => {
    renderWithProviders(
      <RecipeDialog open onOpenChange={() => {}} projectId="p1" mention="fremdes" />
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('gehört dir nicht');
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  });
});
