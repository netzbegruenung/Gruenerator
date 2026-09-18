/**
 * A failed own-recipes load must never fall through to the create form — that
 * would silently open "no own recipe here, start fresh" for a mention that
 * might already have a saved override, and a save from there could clobber
 * it. This is the one behaviour worth a dedicated page test; everything else
 * about the editor itself is `RecipeEditor.vitest.tsx`'s job.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import RecipeEditorPage from './RecipeEditorPage';

const list = vi.hoisted(() => vi.fn());

vi.mock('@gruenerator/shared/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getContractsClient: () => ({ userTextForms: { list } }),
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector({ user: { id: 'u1' } }),
}));

function renderPage(mention = 'mein-rezept') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/agentura/rezept/${mention}/bearbeiten`]}>
        <Routes>
          <Route path="/agentura/rezept/:mention/bearbeiten" element={<RecipeEditorPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  list.mockReset();
});

describe('RecipeEditorPage', () => {
  it('zeigt bei einem Ladefehler eine Wiederholen-Möglichkeit statt den leeren Editor', async () => {
    list.mockResolvedValue({ status: 500, body: { success: false, message: 'Serverfehler' } });
    renderPage();

    expect(await screen.findByText(/nicht geladen werden/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Speichern' })).not.toBeInTheDocument();
  });
});
