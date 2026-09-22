/**
 * `RecipeEditor` is the create/edit surface for one recipe ("Rezept"): one
 * continuous form, no tabs. These tests cover the behaviours the brief calls
 * out: the Save button gates on the required fields (including the examples
 * budget), a successful save PUTs the payload (description/iconKey included)
 * and navigates, a 409 (mention already taken) surfaces the colliding slug
 * under the mention field rather than as a banner, and the sharing section is
 * accessible.
 */
import { ConfirmDialogProvider } from '@gruenerator/ui';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import RecipeEditor from './RecipeEditor';
import { EMPTY_RECIPE_FORM, type RecipeFormState } from './recipeFormState';
import { EXAMPLE_SEPARATOR } from './splitExamples';

import { axe, fireEvent, renderWithProviders, screen, waitFor } from '@/test-utils';

const save = vi.hoisted(() => vi.fn());
const analyze = vi.hoisted(() => vi.fn());
const list = vi.hoisted(() => vi.fn());
const getShareSettings = vi.hoisted(() => vi.fn());
const listMyGroups = vi.hoisted(() => vi.fn());

vi.mock('@gruenerator/shared/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getContractsClient: () => ({
    userTextForms: { save, analyze, list, getShareSettings },
    notebookSharing: { listMyGroups },
  }),
}));

const navigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useNavigate: () => navigate,
}));

function customCreateForm(over: Partial<RecipeFormState> = {}): RecipeFormState {
  return { ...EMPTY_RECIPE_FORM, ...over };
}

function customEditForm(over: Partial<RecipeFormState> = {}): RecipeFormState {
  return {
    ...EMPTY_RECIPE_FORM,
    kind: 'custom',
    mention: 'mein-rezept',
    originalMention: 'mein-rezept',
    title: 'Mein Rezept',
    styleBlock: 'Schreibe kurz und klar.',
    ...over,
  };
}

async function fillTitleAndInstruction(
  user: ReturnType<typeof renderWithProviders>['user'],
  title: string,
  instruction: string
) {
  await user.type(screen.getByLabelText('Name'), title);
  await user.type(screen.getByLabelText('Anleitung'), instruction);
}

/** Die Klappe „Aus Beispielen lernen" unter dem Anleitung-Feld aufziehen. */
async function openExamples(user: ReturnType<typeof renderWithProviders>['user']) {
  await user.click(screen.getByText(/^Aus Beispielen lernen/));
}

beforeEach(() => {
  save.mockReset();
  analyze.mockReset();
  navigate.mockReset();
  list.mockReset().mockResolvedValue({ status: 200, body: { success: true, forms: [] } });
  getShareSettings.mockReset().mockResolvedValue({
    status: 200,
    body: { share_mode: 'private', is_public: false, public_ownership: null },
  });
  listMyGroups.mockReset().mockResolvedValue({ status: 200, body: [] });
});

describe('RecipeEditor', () => {
  it('zeigt alle Felder gleichzeitig, ohne Tabs', async () => {
    const { user } = renderWithProviders(
      <RecipeEditor mode="create" initialState={customCreateForm()} />
    );

    expect(screen.queryAllByRole('tab')).toHaveLength(0);

    await fillTitleAndInstruction(user, 'Mein Testrezept', 'Schreibe kurz und klar.');

    // Beides steht nebeneinander — das war vorher ein Tab-Wechsel.
    expect(screen.getByLabelText('Name')).toHaveValue('Mein Testrezept');
    expect(screen.getByLabelText('Anleitung')).toHaveValue('Schreibe kurz und klar.');
  });

  it('sperrt Speichern, bis Name und Anleitung ausgefüllt sind', async () => {
    const { user } = renderWithProviders(
      <RecipeEditor mode="create" initialState={customCreateForm()} />
    );

    expect(screen.getByRole('button', { name: 'Speichern' })).toBeDisabled();

    await user.type(screen.getByLabelText('Name'), 'Mein Testrezept');
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeDisabled();

    await user.type(screen.getByLabelText('Anleitung'), 'Schreibe kurz und klar.');

    expect(screen.getByRole('button', { name: 'Speichern' })).toBeEnabled();
  });

  it('sperrt Speichern bei zu vielen Beispielen und sagt warum', async () => {
    const { user } = renderWithProviders(
      <RecipeEditor mode="create" initialState={customCreateForm()} />
    );

    await fillTitleAndInstruction(user, 'Mein Testrezept', 'Schreibe kurz und klar.');
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeEnabled();

    // Examples sit under the Anleitung field, behind the "Aus Beispielen
    // lernen" disclosure — raw material for that field, not a subject of
    // their own.
    await openExamples(user);
    const tooMany = Array.from({ length: 21 }, (_, i) => `Beispiel ${i}`).join(EXAMPLE_SEPARATOR);
    fireEvent.change(screen.getByRole('textbox', { name: /Beispiele/ }), {
      target: { value: tooMany },
    });

    expect(screen.getByRole('button', { name: 'Speichern' })).toBeDisabled();
    expect(screen.getByText(/Höchstens \d+ Beispiele erlaubt/)).toBeInTheDocument();
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

  it('zeigt einen 409 unter dem sichtbaren Mention-Feld statt als Banner', async () => {
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
    // The colliding slug must be visible in the field the error sits under —
    // not an empty input, which is what binding to the raw (untouched) draft
    // mention instead of the derived one would show.
    expect(screen.getByLabelText('@mention')).toHaveValue('mein-testrezept');
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

  it('ist frei von Verstößen gegen die Zugänglichkeit im Teilen-Abschnitt', async () => {
    const { container } = renderWithProviders(
      <RecipeEditor mode="edit" initialState={customEditForm()} />
    );

    await waitFor(() => expect(getShareSettings).toHaveBeenCalled());

    await waitFor(async () => {
      expect(await axe(container)).toHaveNoViolations();
    });
  });
  it('tippt einen Bindestrich mitten in der Mention durch', async () => {
    const { user } = renderWithProviders(
      <RecipeEditor mode="create" initialState={customCreateForm()} />
    );

    const mentionField = screen.getByLabelText('@mention');
    await user.type(mentionField, 'mein-rezept');

    // `slugifyName` schneidet den Bindestrich am Ende ab — auf jedem
    // Tastendruck angewandt, käme hier „meinrezept" heraus.
    expect(mentionField).toHaveValue('mein-rezept');
  });

  it('sperrt Speichern, wenn der Titel auf keine Mention slugt', async () => {
    const { user } = renderWithProviders(
      <RecipeEditor mode="create" initialState={customCreateForm()} />
    );

    await fillTitleAndInstruction(user, '!!!', 'Schreibe kurz und klar.');

    expect(screen.getByLabelText('@mention')).toHaveValue('');
    expect(screen.getByText('Bitte einen Namen für die Mention angeben.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeDisabled();
  });

  it('weist eine reservierte Mention ab, ohne zu speichern', async () => {
    const { user } = renderWithProviders(
      <RecipeEditor mode="create" initialState={customCreateForm()} />
    );

    await user.clear(screen.getByLabelText('@mention'));
    await user.type(screen.getByLabelText('@mention'), 'neu');
    await fillTitleAndInstruction(user, 'Irgendein Rezept', 'Schreibe kurz und klar.');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(await screen.findByText('Dieser Name ist reserviert.')).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it('erklärt eine System-Mention vor dem Speichern und verweist auf deren Seite', async () => {
    const { user } = renderWithProviders(
      <RecipeEditor mode="create" initialState={customCreateForm()} />
    );

    await fillTitleAndInstruction(user, 'Presse', 'Schreibe kurz und klar.');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(await screen.findByText(/gehört zu einem mitgelieferten Rezept/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zum Rezept' })).toHaveAttribute(
      'href',
      '/agentura/rezept/presse'
    );
    expect(save).not.toHaveBeenCalled();
  });

  it('zeigt auch einen 400 vom Server unter dem Mention-Feld', async () => {
    save.mockResolvedValueOnce({
      status: 400,
      body: { success: false, message: "@presse ist ein Preset, nicht kind='custom'." },
    });
    const { user } = renderWithProviders(
      <RecipeEditor mode="edit" initialState={customEditForm()} />
    );

    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(
      await screen.findByText("@presse ist ein Preset, nicht kind='custom'.")
    ).toBeInTheDocument();
  });

  it('speichert ein bestehendes Rezept nach einer Titeländerung auf die ALTE Mention', async () => {
    save.mockResolvedValueOnce({
      status: 200,
      body: { success: true, form: { id: 'r1', mention: 'mein-rezept', title: 'Neuer Titel' } },
    });
    const { user } = renderWithProviders(
      <RecipeEditor mode="edit" initialState={customEditForm()} />
    );

    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Ganz anderer Titel');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const call = save.mock.calls[0]?.[0] as { params: { mention: string } };
    expect(call.params).toEqual({ mention: 'mein-rezept' });
  });

  it('speichert eine Preset-Anpassung auf die feste Mention des Presets', async () => {
    save.mockResolvedValueOnce({
      status: 200,
      body: { success: true, form: { id: 'r2', mention: 'presse', title: 'Pressemitteilungen' } },
    });
    const { user } = renderWithProviders(
      <RecipeEditor
        mode="create"
        initialState={customCreateForm({
          kind: 'preset',
          fixedMention: 'presse',
          mention: 'presse',
          textType: 'presse',
          title: 'Pressemitteilungen',
        })}
      />
    );

    await user.type(screen.getByLabelText('Anleitung'), 'Schreibe sachlich.');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const call = save.mock.calls[0]?.[0] as {
      params: { mention: string };
      body: Record<string, unknown>;
    };
    expect(call.params).toEqual({ mention: 'presse' });
    expect(call.body.kind).toBe('preset');
  });

  it('fragt nach, bevor eine Analyse die vorhandene Anleitung ersetzt', async () => {
    const { user } = renderWithProviders(
      <ConfirmDialogProvider>
        <RecipeEditor
          mode="create"
          initialState={customCreateForm({
            title: 'Mein Rezept',
            styleBlock: 'Ein Entwurf, den niemand verlieren will.',
          })}
        />
      </ConfirmDialogProvider>
    );

    await openExamples(user);
    fireEvent.change(screen.getByRole('textbox', { name: /Beispiele/ }), {
      target: { value: 'Ein Beispieltext.' },
    });
    await user.click(screen.getByRole('button', { name: 'Gemeinsamkeiten erkennen' }));

    expect(await screen.findByText('Vorhandene Anleitung ersetzen?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Behalten' }));

    // Abgelehnt heißt: keine Anfrage und der Entwurf steht noch da.
    expect(analyze).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Anleitung')).toHaveValue(
      'Ein Entwurf, den niemand verlieren will.'
    );
  });

  it('analysiert ohne Rückfrage, solange die Anleitung leer ist', async () => {
    analyze.mockResolvedValueOnce({
      status: 200,
      body: { success: true, styleBlock: '## STIL: Mein Rezept', model: 'test' },
    });
    const { user } = renderWithProviders(
      <RecipeEditor mode="create" initialState={customCreateForm({ title: 'Mein Rezept' })} />
    );

    await openExamples(user);
    fireEvent.change(screen.getByRole('textbox', { name: /Beispiele/ }), {
      target: { value: 'Ein Beispieltext.' },
    });
    await user.click(screen.getByRole('button', { name: 'Gemeinsamkeiten erkennen' }));

    await waitFor(() => expect(analyze).toHaveBeenCalledTimes(1));
    const body = (analyze.mock.calls[0]?.[0] as { body: Record<string, unknown> }).body;
    expect(body.title).toBe('Mein Rezept');
    await waitFor(() =>
      expect(screen.getByLabelText('Anleitung')).toHaveValue('## STIL: Mein Rezept')
    );
  });

  it('sperrt die Analyse eines Presets, dessen Name geleert wurde', async () => {
    // Der Textyp galt einmal als Ersatzbeschriftung, also hielt der Wächter ein
    // Preset für beschriftet, auch ohne Namen — der Knopf blieb aktiv und der
    // Server antwortete mit einem rohen 400.
    const { user } = renderWithProviders(
      <RecipeEditor
        mode="create"
        initialState={customCreateForm({
          kind: 'preset',
          fixedMention: 'presse',
          mention: 'presse',
          textType: 'presse',
          title: 'Pressemitteilungen',
        })}
      />
    );

    await user.clear(screen.getByLabelText('Name'));
    await openExamples(user);
    fireEvent.change(screen.getByRole('textbox', { name: /Beispiele/ }), {
      target: { value: 'Ein Beispieltext.' },
    });

    expect(screen.getByRole('button', { name: 'Gemeinsamkeiten erkennen' })).toBeDisabled();
    expect(analyze).not.toHaveBeenCalled();
    expect(screen.getByText(/Gib dem Rezept oben einen Namen/)).toBeInTheDocument();

    // Genau EIN Namensfeld, auch mit offener Beispiel-Klappe. Solange die
    // Tabs den Namen vor dieser Klappe versteckten, trug sie ein zweites.
    const names = screen.getAllByLabelText('Name');
    expect(names).toHaveLength(1);

    await user.type(names[0]!, 'Pressemitteilungen Hessen');
    expect(screen.getByRole('button', { name: 'Gemeinsamkeiten erkennen' })).toBeEnabled();
  });

  it('meldet eine fehlgeschlagene Analyse dauerhaft neben dem Knopf, nicht als Toast', async () => {
    analyze.mockRejectedValueOnce(new Error('Analyse fehlgeschlagen: Modell nicht erreichbar.'));
    const { user } = renderWithProviders(
      <RecipeEditor mode="create" initialState={customCreateForm({ title: 'Mein Rezept' })} />
    );

    await openExamples(user);
    fireEvent.change(screen.getByRole('textbox', { name: /Beispiele/ }), {
      target: { value: 'Ein Beispieltext.' },
    });
    await user.click(screen.getByRole('button', { name: 'Gemeinsamkeiten erkennen' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Analyse fehlgeschlagen: Modell nicht erreichbar.');
  });

  it('ist frei von Verstößen gegen die Zugänglichkeit mit gelistetem Rezept', async () => {
    // Erst mit `is_public: true` rendert die Eigentumsfrage — die Schaltflächen
    // mit `aria-pressed`, die die a11y-Prüfung oben gar nicht zu sehen bekommt.
    getShareSettings.mockResolvedValue({
      status: 200,
      body: { share_mode: 'authenticated', is_public: true, public_ownership: 'owner' },
    });
    const { container } = renderWithProviders(
      <RecipeEditor mode="edit" initialState={customEditForm()} />
    );

    expect(await screen.findByText('Bitte bestätige:')).toBeInTheDocument();

    await waitFor(async () => {
      expect(await axe(container)).toHaveNoViolations();
    });
  });
});
