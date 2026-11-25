/**
 * Der Deeplink `/chat?rezept=…` öffnet den leeren Chat mit dem Rezept als
 * @-Chip. Hier geprüft: die Ansicht wechselt erst auf `overview`, bevor der Chip
 * angefragt wird (sonst ginge er an den Composer eines Threads, der gleich
 * verschwindet), und der Parameter fällt danach aus der URL. Die Anfrage selbst
 * (`useRecipeMentionRequest`) ist in `packages/chat` getestet.
 */
import { useAgentStore } from '@gruenerator/chat';
import { act } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { readRecipeDeepLink, useRecipeDeepLink } from './useRecipeDeepLink';

import { renderWithProviders, screen } from '@/test-utils';

const requested = vi.hoisted(() => [] as Array<{ mention: string; recipeId: string | null }>);

vi.mock('@gruenerator/chat', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useRecipeMentionRequest: (
      link: { mention: string; recipeId: string | null } | null,
      onHandled: () => void
    ) => {
      if (link && !requested.some((r) => r.mention === link.mention)) {
        requested.push(link);
        queueMicrotask(onHandled);
      }
    },
  };
});

function Probe({ enabled = true }: { enabled?: boolean }) {
  useRecipeDeepLink(enabled);
  const location = useLocation();
  return <output>{location.search}</output>;
}

beforeEach(() => {
  requested.length = 0;
  useAgentStore.getState().setChatViewMode('overview');
});

describe('readRecipeDeepLink', () => {
  it('reads the legacy ?skill= link', () => {
    expect(readRecipeDeepLink(new URLSearchParams('skill=presse-bayern'))).toEqual({
      mention: 'presse-bayern',
      recipeId: null,
    });
  });

  it('prefers ?rezept= when both parameters are present', () => {
    expect(readRecipeDeepLink(new URLSearchParams('skill=a&rezept=b&rezeptId=row-1'))).toEqual({
      mention: 'b',
      recipeId: 'row-1',
    });
  });
});

describe('useRecipeDeepLink', () => {
  it('requests the chip and drops the recipe parameters from the URL', async () => {
    renderWithProviders(<Probe />, { route: '/chat?rezept=presse&projekt=p1' });

    await act(async () => {});

    expect(requested).toEqual([{ mention: 'presse', recipeId: null }]);
    expect(screen.getByRole('status')).toHaveTextContent('?projekt=p1');
  });

  it('switches a thread view to the empty chat before requesting', async () => {
    useAgentStore.getState().setChatViewMode('thread');

    renderWithProviders(<Probe />, { route: '/chat?rezept=mein-rezept&rezeptId=row-1' });
    await act(async () => {});

    expect(useAgentStore.getState().chatViewMode).toBe('overview');
    expect(requested).toEqual([{ mention: 'mein-rezept', recipeId: 'row-1' }]);
  });

  it('does nothing while disabled (Landesverband hub slug)', async () => {
    useAgentStore.getState().setChatViewMode('thread');

    renderWithProviders(<Probe enabled={false} />, { route: '/chat?rezept=presse' });
    await act(async () => {});

    expect(requested).toEqual([]);
    expect(useAgentStore.getState().chatViewMode).toBe('thread');
    expect(screen.getByRole('status')).toHaveTextContent('?rezept=presse');
  });
});
