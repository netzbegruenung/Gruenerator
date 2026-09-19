/**
 * `RecipePicker` is the agent editor's "Standard-Rezept" select: which recipe
 * the chat loads for this agent when the user picks none themselves. It
 * groups system recipes (addressed by mention) from own/shared/public ones
 * (addressed by row id, so a rename doesn't break the binding) — these tests
 * cover both groups rendering and the value each emits.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RecipePicker } from './RecipePicker';

import { axe, renderWithProviders, screen, waitFor } from '@/test-utils';

const list = vi.hoisted(() => vi.fn());
const listPublic = vi.hoisted(() => vi.fn());

vi.mock('@gruenerator/shared/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getContractsClient: () => ({ userTextForms: { list, listPublic } }),
}));

const SYSTEM_SKILL = vi.hoisted(() => ({
  identifier: 'musteragent',
  title: 'Musterrezept',
  description: 'Ein Beispielrezept',
  iconKey: 'PiSparkle',
  avatar: '✨',
  backgroundColor: '#587C6D',
  mention: 'musterrezept',
}));

vi.mock('@gruenerator/chat', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  agentsList: [SYSTEM_SKILL],
  useHiddenSkillMentions: () => [],
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector({ locale: 'de-DE' }),
}));

function ownRow(over: Record<string, unknown> = {}) {
  return {
    id: 'row-1',
    kind: 'custom',
    textType: null,
    mention: 'eigenes-rezept',
    title: 'Eigenes Rezept',
    examples: [],
    styleBlock: 'Schreibe kurz und klar.',
    model: null,
    analyzedAt: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    sharedWithGroups: [],
    sharedFromGroup: null,
    ownerName: null,
    description: null,
    iconKey: null,
    shareMode: 'private',
    isPublic: false,
    publicOwnership: null,
    ...over,
  };
}

function publicRow(over: Record<string, unknown> = {}) {
  const { examples: _examples, sharedWithGroups: _groups, ...rest } = ownRow();
  return {
    ...rest,
    id: 'pub-1',
    mention: 'fremdes-rezept',
    title: 'Fremdes Rezept',
    exampleCount: 0,
    ...over,
  };
}

beforeEach(() => {
  list.mockReset().mockResolvedValue({ status: 200, body: { success: true, forms: [ownRow()] } });
  listPublic
    .mockReset()
    .mockResolvedValue({ status: 200, body: { success: true, forms: [publicRow()] } });
});

describe('RecipePicker', () => {
  it('rendert System-Rezepte und eigene Rezepte in getrennten Gruppen', async () => {
    const { container } = renderWithProviders(
      <RecipePicker value={{ mention: null, id: null }} onChange={vi.fn()} />
    );

    await screen.findByRole('option', { name: 'Eigenes Rezept' });

    const systemGroup = container.querySelector('optgroup[label="Rezepte"]');
    const ownGroup = container.querySelector('optgroup[label="Meine Rezepte"]');
    expect(systemGroup).not.toBeNull();
    expect(ownGroup).not.toBeNull();
    expect(systemGroup).toHaveTextContent('Musterrezept');
    expect(ownGroup).toHaveTextContent('Eigenes Rezept');
    expect(ownGroup).toHaveTextContent('Fremdes Rezept');
    expect(screen.getByLabelText('Standard-Rezept (optional)')).toBeInTheDocument();
  });

  it('emittiert Erwähnung und id:null bei Auswahl eines System-Rezepts', async () => {
    const onChange = vi.fn();
    const { user } = renderWithProviders(
      <RecipePicker value={{ mention: null, id: null }} onChange={onChange} />
    );
    await waitFor(() => expect(list).toHaveBeenCalled());

    await user.selectOptions(screen.getByLabelText('Standard-Rezept (optional)'), 'Musterrezept');

    expect(onChange).toHaveBeenCalledWith({ mention: 'musterrezept', id: null });
  });

  it('emittiert Erwähnung und id bei Auswahl eines eigenen Rezepts', async () => {
    const onChange = vi.fn();
    const { user } = renderWithProviders(
      <RecipePicker value={{ mention: null, id: null }} onChange={onChange} />
    );
    await screen.findByRole('option', { name: 'Eigenes Rezept' });

    await user.selectOptions(screen.getByLabelText('Standard-Rezept (optional)'), 'Eigenes Rezept');

    expect(onChange).toHaveBeenCalledWith({ mention: 'eigenes-rezept', id: 'row-1' });
  });

  it('emittiert beide Felder als null beim Zurücksetzen', async () => {
    const onChange = vi.fn();
    const { user } = renderWithProviders(
      <RecipePicker value={{ mention: 'musterrezept', id: null }} onChange={onChange} />
    );
    await waitFor(() => expect(list).toHaveBeenCalled());

    await user.selectOptions(
      screen.getByLabelText('Standard-Rezept (optional)'),
      '— kein Standard-Rezept —'
    );

    expect(onChange).toHaveBeenCalledWith({ mention: null, id: null });
  });

  it('ist frei von Verstößen gegen die Zugänglichkeit', async () => {
    const { container } = renderWithProviders(
      <RecipePicker value={{ mention: null, id: null }} onChange={vi.fn()} />
    );
    await waitFor(() => expect(list).toHaveBeenCalled());

    await waitFor(async () => {
      expect(await axe(container)).toHaveNoViolations();
    });
  });
});
