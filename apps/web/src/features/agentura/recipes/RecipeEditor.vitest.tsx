/**
 * `RecipeEditor` is the create/edit page for one recipe ("Rezept"): one
 * column, a sticky footer with the category chip and the actions. Save is
 * never disabled — a click with gaps names every missing field and focuses
 * the first. A successful save PUTs the payload (description/iconKey included)
 * and navigates, a 409 (mention already taken) surfaces under the mention
 * field rather than as a banner, and the sharing dialog behind „⋯" is
 * accessible.
 */
import { SKILL_CATEGORY_LABELS } from '@gruenerator/shared/agents';
import {
  EMPTY_RECIPE_FORM,
  type RecipeFormState,
  EXAMPLE_SEPARATOR,
} from '@gruenerator/shared/grueneratoren';
import { ConfirmDialogProvider } from '@gruenerator/ui';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import RecipeEditor from './RecipeEditor';

import { axe, fireEvent, renderWithProviders, screen, waitFor } from '@/test-utils';

const save = vi.hoisted(() => vi.fn());
const analyze = vi.hoisted(() => vi.fn());
const describeRecipe = vi.hoisted(() => vi.fn());
const list = vi.hoisted(() => vi.fn());
const getShareSettings = vi.hoisted(() => vi.fn());
const listMyGroups = vi.hoisted(() => vi.fn());

vi.mock('@gruenerator/shared/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getContractsClient: () => ({
    userTextForms: { save, analyze, describe: describeRecipe, list, getShareSettings },
    notebookSharing: { listMyGroups },
  }),
}));

const navigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useNavigate: () => navigate,
}));

const WANN_BESCHREIBUNG = 'Kurze Rundbriefe. Nutzen, wenn ein Rundbrief entsteht.';
const WANN = 'Wann soll der Grünerator es nutzen?';
const MENTION = 'Im Chat aufrufen mit';

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
    description: WANN_BESCHREIBUNG,
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
  await user.type(screen.getByLabelText(WANN), WANN_BESCHREIBUNG);
}

const saveButton = () => screen.getByRole('button', { name: 'Speichern' });

/** Der Teilen-Dialog hinter „⋯" — nur beim Bearbeiten eines eigenen Rezepts. */
async function openSharing(user: ReturnType<typeof renderWithProviders>['user']) {
  await user.click(screen.getByRole('button', { name: 'Weitere Aktionen' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Teilen …' }));
}

/** Statt der Anleitung die Beispiele zeigen, aus denen sie entsteht. */
async function openExamples(user: ReturnType<typeof renderWithProviders>['user']) {
  await user.click(screen.getByRole('button', { name: /^Aus Beispielen lernen/ }));
}

beforeEach(() => {
  save.mockReset();
  analyze.mockReset();
  describeRecipe.mockReset();
  navigate.mockReset();
  list.mockReset().mockResolvedValue({ status: 200, body: { success: true, forms: [] } });
  getShareSettings.mockReset().mockResolvedValue({
    status: 200,
    body: { share_mode: 'private', is_public: false, public_ownership: null },
  });
  listMyGroups.mockReset().mockResolvedValue({ status: 200, body: [] });
});

describe('RecipeEditor', () => {
  it('zeigt alle Felder gleichzeitig, ohne Tabs und ohne Vorschau', async () => {
    const { user } = renderWithProviders(
      <RecipeEditor mode="create" initialState={customCreateForm()} />
    );

    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.queryByText('Vorschau')).not.toBeInTheDocument();

    await fillTitleAndInstruction(user, 'Mein Testrezept', 'Schreibe kurz und klar.');

    expect(screen.getByLabelText('Name')).toHaveValue('Mein Testrezept');
    expect(screen.getByLabelText('Anleitung')).toHaveValue('Schreibe kurz und klar.');
    expect(screen.getByLabelText(WANN)).toHaveValue(WANN_BESCHREIBUNG);
  });

  it('nennt beim Speichern jedes fehlende Feld und setzt den Fokus auf das erste', async () => {
    const { user } = renderWithProviders(
      <RecipeEditor mode="create" initialState={customCreateForm()} />
    );

    // Nie grau: ein gesperrter Knopf sagt nicht, was fehlt.
    expect(saveButton()).toBeEnabled();
    await user.click(saveButton());

    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText('Gib dem Rezept einen Namen.')).toBeInTheDocument();
    expect(screen.getByText(/Schreib eine Anleitung/)).toBeInTheDocument();
    expect(screen.getByText(/Beschreib in mindestens 30 Zeichen/)).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveFocus();
    expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true');
  });

  it('speichert nicht ohne Beschreibung und springt zu ihr', async () => {
    const { user } = renderWithProviders(
      <RecipeEditor mode="create" initialState={customCreateForm()} />
    );

    await user.type(screen.getByLabelText('Name'), 'Mein Testrezept');
    await user.type(screen.getByLabelText('Anleitung'), 'Schreibe kurz und klar.');
    await user.click(saveButton());

    expect(save).not.toHaveBeenCalled();
    expect(screen.getByLabelText(WANN)).toHaveFocus();
  });

  it('zeigt Fehler erst nach dem ersten Speichern, nicht schon beim Öffnen', () => {
    renderWithProviders(<RecipeEditor mode="create" initialState={customCreateForm()} />);

    expect(screen.queryByText('Gib dem Rezept einen Namen.')).not.toBeInTheDocument();
    expect(screen.getByLabelText(WANN)).not.toHaveAttribute('aria-invalid');
    // Der Zähler nennt die Mindestlänge ruhig, solange sie fehlt.
    expect(screen.getByText('0/30')).toBeInTheDocument();
  });

  it('speichert nicht bei zu vielen Beispielen und sagt warum', async () => {
    const { user } = renderWithProviders(
      <RecipeEditor mode="create" initialState={customCreateForm()} />
    );

    await fillTitleAndInstruction(user, 'Mein Testrezept', 'Schreibe kurz und klar.');
    await openExamples(user);
    const tooMany = Array.from({ length: 21 }, (_, i) => `Beispiel ${i}`).join(EXAMPLE_SEPARATOR);
    fireEvent.change(screen.getByRole('textbox', { name: /Beispiele/ }), {
      target: { value: tooMany },
    });

    expect(screen.getByText(/Höchstens \d+ Beispiele erlaubt/)).toBeInTheDocument();
    await user.click(saveButton());
    expect(save).not.toHaveBeenCalled();
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

    await fillTitleAndInstruction(user, 'Mein Testrezept', 'Schreibe kurz und klar.');
    await user.click(saveButton());

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const call = save.mock.calls[0]?.[0] as {
      params: { mention: string };
      body: Record<string, unknown>;
    };
    expect(call.params).toEqual({ mention: 'mein-testrezept' });
    expect(call.body.description).toBe(WANN_BESCHREIBUNG);
    expect(call.body.iconKey).toBe(EMPTY_RECIPE_FORM.iconKey);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/agentura/rezept/mein-testrezept'));
  });

  it('zeigt den Namen im Chat erst, wenn ein Name getippt ist, und leitet ihn davon ab', async () => {
    const { user } = renderWithProviders(
      <RecipeEditor mode="create" initialState={customCreateForm()} />
    );

    expect(screen.queryByLabelText(MENTION)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Name'), 'Einladung MV');
    expect(screen.getByLabelText(MENTION)).toHaveValue('einladung-mv');
  });

  it('speichert die im Chip gewählte Kategorie mit', async () => {
    save.mockResolvedValueOnce({
      status: 200,
      body: { success: true, form: { id: 'r1', mention: 'mein-testrezept', title: 'x' } },
    });
    const { user } = renderWithProviders(
      <RecipeEditor mode="create" initialState={customCreateForm()} />
    );

    await fillTitleAndInstruction(user, 'Mein Testrezept', 'Schreibe kurz und klar.');
    await user.click(screen.getByRole('button', { name: 'Kategorie: Keine Kategorie' }));
    await user.click(
      await screen.findByRole('menuitemradio', { name: SKILL_CATEGORY_LABELS.social })
    );
    await user.click(saveButton());

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const call = save.mock.calls[0]?.[0] as { body: Record<string, unknown> };
    expect(call.body.category).toBe('social');
  });

  it('zeigt die gespeicherte Kategorie beim Bearbeiten im Chip', () => {
    renderWithProviders(
      <RecipeEditor mode="edit" initialState={customEditForm({ category: 'presse' })} />
    );

    expect(
      screen.getByRole('button', { name: `Kategorie: ${SKILL_CATEGORY_LABELS.presse}` })
    ).toBeInTheDocument();
  });

  it('lässt ein bestehendes Rezept mit leerer Beschreibung unverändert speichern', async () => {
    save.mockResolvedValue({
      status: 200,
      body: { success: true, form: { id: 'r1', mention: 'mein-rezept', title: 'Mein Rezept' } },
    });
    const { user } = renderWithProviders(
      <RecipeEditor mode="edit" initialState={customEditForm({ description: '' })} />
    );

    // Wer die Beschreibung anfasst, muss die Mindestlänge halten.
    await user.type(screen.getByLabelText(WANN), 'kurz');
    await user.click(saveButton());
    expect(save).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText(WANN));
    await user.click(saveButton());
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  });

  it('schreibt die Beschreibung mit KI aus Name und Anleitung', async () => {
    describeRecipe.mockResolvedValueOnce({
      status: 200,
      body: { success: true, description: WANN_BESCHREIBUNG },
    });
    const { user } = renderWithProviders(
      <RecipeEditor mode="create" initialState={customCreateForm()} />
    );

    const ai = screen.getByRole('button', { name: 'Mit KI erstellen' });
    expect(ai).toBeDisabled();

    await user.type(screen.getByLabelText('Name'), 'Rundbrief');
    await user.type(screen.getByLabelText('Anleitung'), 'Schreibe kurz und klar.');
    await user.click(ai);

    await waitFor(() => expect(screen.getByLabelText(WANN)).toHaveValue(WANN_BESCHREIBUNG));
    expect(describeRecipe).toHaveBeenCalledWith({
      body: { title: 'Rundbrief', styleBlock: 'Schreibe kurz und klar.' },
    });
  });

  it('fragt nach, bevor die KI eine getippte Beschreibung ersetzt', async () => {
    const { user } = renderWithProviders(
      <ConfirmDialogProvider>
        <RecipeEditor
          mode="create"
          initialState={customCreateForm({
            title: 'Rundbrief',
            styleBlock: 'Schreibe kurz.',
            description: 'Meine eigene Beschreibung, die bleiben soll.',
          })}
        />
      </ConfirmDialogProvider>
    );

    await user.click(screen.getByRole('button', { name: 'Mit KI neu erstellen' }));
    expect(await screen.findByText('Beschreibung ersetzen?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Abbrechen' }));

    expect(describeRecipe).not.toHaveBeenCalled();
    expect(screen.getByLabelText(WANN)).toHaveValue('Meine eigene Beschreibung, die bleiben soll.');
  });

  it('meldet eine fehlgeschlagene KI-Beschreibung am Feld', async () => {
    describeRecipe.mockResolvedValueOnce({
      status: 500,
      body: { success: false, message: 'Beschreibung konnte nicht erstellt werden.' },
    });
    const { user } = renderWithProviders(
      <RecipeEditor
        mode="create"
        initialState={customCreateForm({ title: 'Rundbrief', styleBlock: 'Schreibe kurz.' })}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Mit KI erstellen' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Beschreibung konnte nicht erstellt werden.'
    );
    expect(screen.getByLabelText(WANN)).toHaveValue('');
  });

  it('zeigt einen 409 unter dem Namen im Chat statt als Banner', async () => {
    save.mockResolvedValueOnce({
      status: 409,
      body: { success: false, message: 'Diese Mention ist bereits vergeben.' },
    });
    const { user } = renderWithProviders(
      <RecipeEditor mode="create" initialState={customCreateForm()} />
    );

    await fillTitleAndInstruction(user, 'Mein Testrezept', 'Schreibe kurz und klar.');
    await user.click(saveButton());

    expect(await screen.findByText('Diese Mention ist bereits vergeben.')).toBeInTheDocument();
    // Der kollidierende Name muss im Feld stehen, unter dem der Fehler steht.
    expect(screen.getByLabelText(MENTION)).toHaveValue('mein-testrezept');
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

  it('ist frei von Verstößen nach einem Speicherversuch mit Lücken', async () => {
    const { container, user } = renderWithProviders(
      <RecipeEditor mode="create" initialState={customCreateForm()} />
    );
    await user.click(saveButton());

    await waitFor(async () => {
      expect(await axe(container)).toHaveNoViolations();
    });
  });

  it('legt Im Chat verwenden, Teilen und Löschen beim Bearbeiten hinter „⋯"', async () => {
    const { user } = renderWithProviders(
      <RecipeEditor mode="edit" initialState={customEditForm()} />
    );

    expect(screen.queryByRole('button', { name: 'Löschen' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Weitere Aktionen' }));

    expect(await screen.findByRole('menuitem', { name: 'Im Chat verwenden' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Teilen …' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Löschen' })).toBeInTheDocument();
  });

  it('bietet beim Anlegen kein „⋯"-Menü an', () => {
    renderWithProviders(<RecipeEditor mode="create" initialState={customCreateForm()} />);

    expect(screen.queryByRole('button', { name: 'Weitere Aktionen' })).not.toBeInTheDocument();
  });

  it('ist frei von Verstößen gegen die Zugänglichkeit im Teilen-Dialog', async () => {
    const { baseElement, user } = renderWithProviders(
      <RecipeEditor mode="edit" initialState={customEditForm()} />
    );

    await openSharing(user);
    await waitFor(() => expect(getShareSettings).toHaveBeenCalled());

    await waitFor(async () => {
      expect(await axe(baseElement)).toHaveNoViolations();
    });
  });

  it('tippt einen Bindestrich mitten im Namen im Chat durch', async () => {
    const { user } = renderWithProviders(
      <RecipeEditor mode="create" initialState={customCreateForm()} />
    );

    await user.type(screen.getByLabelText('Name'), 'x');
    const mentionField = screen.getByLabelText(MENTION);
    await user.clear(mentionField);
    await user.type(mentionField, 'mein-rezept');

    // `slugifyName` schneidet den Bindestrich am Ende ab — auf jedem
    // Tastendruck angewandt, käme hier „meinrezept" heraus.
    expect(mentionField).toHaveValue('mein-rezept');
  });

  it('speichert nicht, wenn der Titel auf keinen Namen im Chat slugt', async () => {
    const { user } = renderWithProviders(
      <RecipeEditor mode="create" initialState={customCreateForm()} />
    );

    await fillTitleAndInstruction(user, '!!!', 'Schreibe kurz und klar.');
    expect(screen.getByLabelText(MENTION)).toHaveValue('');

    await user.click(saveButton());
    expect(screen.getByText(/Der Name im Chat braucht mindestens zwei/)).toBeInTheDocument();
    expect(screen.getByLabelText(MENTION)).toHaveFocus();
    expect(save).not.toHaveBeenCalled();
  });

  it('weist einen reservierten Namen im Chat ab, ohne zu speichern', async () => {
    const { user } = renderWithProviders(
      <RecipeEditor mode="create" initialState={customCreateForm()} />
    );

    await fillTitleAndInstruction(user, 'Irgendein Rezept', 'Schreibe kurz und klar.');
    await user.clear(screen.getByLabelText(MENTION));
    await user.type(screen.getByLabelText(MENTION), 'neu');
    await user.click(saveButton());

    expect(await screen.findByText('Dieser Name ist reserviert.')).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it('erklärt eine System-Mention vor dem Speichern und verweist auf deren Seite', async () => {
    const { user } = renderWithProviders(
      <RecipeEditor mode="create" initialState={customCreateForm()} />
    );

    await fillTitleAndInstruction(user, 'Presse', 'Schreibe kurz und klar.');
    await user.click(saveButton());

    expect(await screen.findByText(/gehört zu einem mitgelieferten Rezept/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zum Rezept' })).toHaveAttribute(
      'href',
      '/agentura/rezept/presse'
    );
    expect(save).not.toHaveBeenCalled();
  });

  it('zeigt auch einen 400 vom Server unter dem Namen im Chat', async () => {
    save.mockResolvedValueOnce({
      status: 400,
      body: { success: false, message: "@presse ist ein Preset, nicht kind='custom'." },
    });
    const { user } = renderWithProviders(
      <RecipeEditor mode="edit" initialState={customEditForm()} />
    );

    await user.click(saveButton());

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
    await user.click(saveButton());

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const call = save.mock.calls[0]?.[0] as { params: { mention: string } };
    expect(call.params).toEqual({ mention: 'mein-rezept' });
    expect(await screen.findByText('Gespeichert ✓')).toBeInTheDocument();
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
          description: WANN_BESCHREIBUNG,
        })}
      />
    );

    // Die feste Erwähnung steht als Text, nicht als Feld.
    expect(screen.queryByLabelText(MENTION)).not.toBeInTheDocument();
    expect(screen.getByText('@presse')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Anleitung'), 'Schreibe sachlich.');
    await user.click(saveButton());

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
    await user.click(screen.getByRole('button', { name: 'Anleitung erstellen' }));

    expect(await screen.findByText('Vorhandene Anleitung ersetzen?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Behalten' }));

    // Abgelehnt heißt: keine Anfrage und der Entwurf steht noch da.
    expect(analyze).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Zur Anleitung' }));
    expect(screen.getByLabelText('Anleitung')).toHaveValue(
      'Ein Entwurf, den niemand verlieren will.'
    );
  });

  it('analysiert ohne Rückfrage und zeigt danach wieder die Anleitung', async () => {
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
    await user.click(screen.getByRole('button', { name: 'Anleitung erstellen' }));

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

    expect(screen.getByRole('button', { name: 'Anleitung erstellen' })).toBeDisabled();
    expect(analyze).not.toHaveBeenCalled();
    expect(screen.getByText(/Gib dem Rezept oben einen Namen/)).toBeInTheDocument();

    // Genau EIN Namensfeld, auch während die Beispiele offen sind.
    const names = screen.getAllByLabelText('Name');
    expect(names).toHaveLength(1);

    await user.type(names[0]!, 'Pressemitteilungen Hessen');
    expect(screen.getByRole('button', { name: 'Anleitung erstellen' })).toBeEnabled();
  });

  it('behandelt eine 200 ohne styleBlock als fehlgeschlagene Analyse', async () => {
    // Eine wohlgeformte 200 ist nicht garantiert: ts-rest prüft die Antwort mit
    // unserem eigenen `api` nicht nach. Fehlte das Feld, landete `undefined` im
    // Formular und das nächste `form.styleBlock.trim()` riss die ganze Seite in
    // die Fehlergrenze — statt der Zeile, die es dafür längst gibt (#3503).
    analyze.mockResolvedValueOnce({ status: 200, body: { success: true, model: 'test' } });
    const { user } = renderWithProviders(
      <RecipeEditor mode="create" initialState={customCreateForm({ title: 'Mein Rezept' })} />
    );

    await openExamples(user);
    fireEvent.change(screen.getByRole('textbox', { name: /Beispiele/ }), {
      target: { value: 'Ein Beispieltext.' },
    });
    await user.click(screen.getByRole('button', { name: 'Anleitung erstellen' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('ohne Ergebnis');
    // Das Formular steht noch, die Anleitung ist unberührt.
    await user.click(screen.getByRole('button', { name: 'Zur Anleitung' }));
    expect(screen.getByLabelText('Anleitung')).toHaveValue('');
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
    await user.click(screen.getByRole('button', { name: 'Anleitung erstellen' }));

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
    const { baseElement, user } = renderWithProviders(
      <RecipeEditor mode="edit" initialState={customEditForm()} />
    );

    await openSharing(user);
    expect(await screen.findByText('Bitte bestätige:')).toBeInTheDocument();

    await waitFor(async () => {
      expect(await axe(baseElement)).toHaveNoViolations();
    });
  });
});
