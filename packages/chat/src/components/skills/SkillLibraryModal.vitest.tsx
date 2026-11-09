/**
 * Der Stern in der Rezept-Bibliothek schreibt in die Bibliothek am Konto
 * (`PUT /api/user-library/recipe/:ref`), nicht mehr in den lokalen Speicher.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listedAgentsList } from '../../lib/agents';
import { setTextforms } from '../../lib/mentionables';

import { SkillLibraryModal } from './SkillLibraryModal';

const list = vi.hoisted(() => vi.fn());
const add = vi.hoisted(() => vi.fn());
const remove = vi.hoisted(() => vi.fn());

vi.mock('@gruenerator/shared/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getContractsClient: () => ({ userLibrary: { list, add, remove } }),
}));

vi.mock('../../hooks/useMentionablesQuery', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useHiddenSkillMentions: () => [],
}));

vi.mock('../../hooks/useUserLandesverbaende', () => ({
  useUserLandesverbaende: () => ({ lvIds: null }),
}));

function renderModal() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <SkillLibraryModal open onClose={vi.fn()} onSelect={vi.fn()} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  setTextforms([]);
  list.mockReset().mockResolvedValue({ status: 200, body: { items: [] } });
  add.mockReset().mockResolvedValue({ status: 200, body: { success: true } });
  remove.mockReset().mockResolvedValue({ status: 200, body: { success: true } });
});

const ownForm = (over: {
  id: string;
  mention: string;
  title: string;
  category: 'social' | null;
}) => ({
  description: null,
  iconKey: null,
  sharedFromGroup: null,
  ownerName: null,
  isPublic: false,
  ...over,
});

describe('SkillLibraryModal', () => {
  it('lists an own recipe with category social under "Social Media"', async () => {
    setTextforms([ownForm({ id: 'r1', mention: 'ov-post', title: 'OV-Post', category: 'social' })]);
    renderModal();

    const heading = await screen.findByText('Social Media');
    const recipe = screen.getByText('OV-Post');
    // Die Überschrift steht vor dem Rezept und keine weitere Gruppe dazwischen.
    expect(heading.compareDocumentPosition(recipe) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText('Meine Rezepte')).not.toBeInTheDocument();
  });

  it('puts an own recipe without category under "Meine Rezepte"', async () => {
    setTextforms([ownForm({ id: 'r2', mention: 'mein-text', title: 'Mein Text', category: null })]);
    renderModal();

    expect(await screen.findByText('Meine Rezepte')).toBeInTheDocument();
    expect(screen.getByText('Mein Text')).toBeInTheDocument();
  });

  it('speaks of recipes, not skills, in the subtitle', async () => {
    renderModal();
    expect(
      await screen.findByText('Rezepte, Agents und Quellen rufst du mit @ auf.')
    ).toBeInTheDocument();
  });

  it('saves a starred recipe to the user library', async () => {
    renderModal();
    const stars = await screen.findAllByRole('button', { name: 'Zu Favoriten hinzufügen' });

    await userEvent.click(stars[0]);

    await waitFor(() => expect(add).toHaveBeenCalledTimes(1));
    const [call] = add.mock.calls[0] as [{ params: { kind: string; ref: string } }];
    const { params } = call;
    expect(params.kind).toBe('recipe');
    expect(listedAgentsList.map((a) => a.mention)).toContain(params.ref);
  });

  it('shows a recipe from the library as starred and removes it on click', async () => {
    const first = listedAgentsList[0];
    list.mockResolvedValue({
      status: 200,
      body: { items: [{ kind: 'recipe', ref: first.mention, createdAt: '2026-11-09' }] },
    });
    renderModal();

    const star = (await screen.findAllByRole('button', { name: 'Aus Favoriten entfernen' }))[0];
    await userEvent.click(star);

    await waitFor(() =>
      expect(remove).toHaveBeenCalledWith({ params: { kind: 'recipe', ref: first.mention } })
    );
  });
});
