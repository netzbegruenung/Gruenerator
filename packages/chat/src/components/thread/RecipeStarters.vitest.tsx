/**
 * Rezept-Starter im leeren Chat: gespeicherte Rezepte (Bibliothek) vor den
 * System-Standardrezepten, und ein Klick wirkt wie die Wahl im Plus-Menü.
 */
import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getAgentMentionables, setTextforms } from '../../lib/mentionables';
import { onMentionRequest } from '../../lib/mentionRequest';
import { useAgentStore } from '../../stores/chatStore';

import { GrueneratorComposer } from './GrueneratorComposer';
import { RecipeStarters } from './RecipeStarters';

const list = vi.hoisted(() => vi.fn());

vi.mock('@gruenerator/shared/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getContractsClient: () => ({ userLibrary: { list } }),
}));

function Chat({ withComposer }: { withComposer: boolean }) {
  const runtime = useLocalRuntime({
    run: async function* () {
      yield { content: [{ type: 'text' as const, text: 'Antwort' }] };
    },
  });
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <RecipeStarters />
      {withComposer && <GrueneratorComposer variant="pill" />}
    </AssistantRuntimeProvider>
  );
}

function renderStarters(withComposer = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <Chat withComposer={withComposer} />
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

  it('selecting a starter goes through the mention path: pill shown, removing it clears the store', async () => {
    libraryOf();
    const target = defaults()[0];
    expect(target).toBeDefined();
    renderStarters(true);

    await userEvent.click(await screen.findByRole('button', { name: target.title }));

    expect(
      await screen.findByRole('button', { name: `${target.title} entfernen` })
    ).toBeInTheDocument();
    expect(useAgentStore.getState().activeSkillMention).toBe(target.mention);

    await userEvent.click(screen.getByRole('button', { name: `${target.title} entfernen` }));
    await waitFor(() => expect(useAgentStore.getState().activeSkillMention).toBeNull());
  });

  it('hands a saved text form over with its row id', async () => {
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
    const requested = vi.fn();
    const off = onMentionRequest(requested);
    renderStarters();

    await userEvent.click(await screen.findByRole('button', { name: 'Mein Stil' }));
    off();

    expect(requested).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'textform', identifier: 'row-7', mention: 'mein-stil' })
    );
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
