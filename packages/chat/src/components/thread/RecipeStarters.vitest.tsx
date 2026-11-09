/**
 * Rezept-Starter im leeren Chat: gespeicherte Rezepte (Bibliothek) vor den
 * System-Standardrezepten, und ein Klick wirkt wie die Wahl im Plus-Menü.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getAgentMentionables, setTextforms } from '../../lib/mentionables';
import { useAgentStore } from '../../stores/chatStore';

import { RecipeStarters } from './RecipeStarters';

const list = vi.hoisted(() => vi.fn());
const setText = vi.hoisted(() => vi.fn());

vi.mock('@gruenerator/shared/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getContractsClient: () => ({ userLibrary: { list } }),
}));

vi.mock('@assistant-ui/react', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useAui: () => ({ composer: { setText } }),
}));

function renderStarters(limit?: number) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <RecipeStarters {...(limit ? { limit } : {})} />
    </QueryClientProvider>
  );
}

const libraryOf = (...refs: string[]) =>
  list.mockResolvedValue({
    status: 200,
    body: { items: refs.map((ref) => ({ kind: 'recipe', ref, createdAt: '2026-11-09' })) },
  });

const defaults = () => getAgentMentionables().filter((a) => a.isSystemDefault);

beforeEach(() => {
  list.mockReset();
  setText.mockReset();
  setTextforms([]);
  useAgentStore.setState({ activeSkillMention: null, activeRecipeId: null });
});

describe('RecipeStarters', () => {
  it('prefers saved recipes over system defaults', async () => {
    const saved = getAgentMentionables().find((a) => !a.isSystemDefault);
    expect(saved).toBeDefined();
    libraryOf(saved!.mention);
    renderStarters();

    await vi.waitFor(() =>
      expect(screen.getAllByRole('button')[0]).toHaveTextContent(saved!.title)
    );
    expect(screen.getAllByRole('button').length).toBeLessThanOrEqual(4);
  });

  it('selecting a starter activates the recipe like the plus menu', async () => {
    libraryOf();
    const target = defaults()[0];
    expect(target).toBeDefined();
    renderStarters();

    await userEvent.click(await screen.findByRole('button', { name: target.title }));

    expect(useAgentStore.getState().activeSkillMention).toBe(target.mention);
    expect(useAgentStore.getState().activeRecipeId).toBeNull();
    expect(setText).toHaveBeenCalledWith(`@${target.mention} `);
  });

  it('carries the row id of a saved text form', async () => {
    setTextforms([
      {
        id: 'row-7',
        mention: 'mein-stil',
        title: 'Mein Stil',
        description: null,
        iconKey: null,
        sharedFromGroup: null,
        ownerName: null,
        isPublic: false,
      },
    ]);
    libraryOf('row-7');
    renderStarters();

    await userEvent.click(await screen.findByRole('button', { name: 'Mein Stil' }));

    expect(useAgentStore.getState().activeSkillMention).toBe('mein-stil');
    expect(useAgentStore.getState().activeRecipeId).toBe('row-7');
  });

  it('renders nothing when no recipe is available', async () => {
    libraryOf();
    vi.spyOn(await import('../../lib/mentionables'), 'getAgentMentionables').mockReturnValue([]);
    const { container } = renderStarters();

    await vi.waitFor(() => expect(list).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    vi.restoreAllMocks();
  });
});
