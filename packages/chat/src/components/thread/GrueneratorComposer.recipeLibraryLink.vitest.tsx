/**
 * „Zur Rezept-Bibliothek“ im Plus-Menü führt in den Marktplatz (Reiter Rezepte),
 * nicht mehr in die Agentura.
 */
import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { GrueneratorComposer } from './GrueneratorComposer';

vi.mock('@gruenerator/shared/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getContractsClient: () => ({
    userLibrary: { list: vi.fn().mockResolvedValue({ status: 200, body: { items: [] } }) },
  }),
}));

function Harness({ onNavigate }: { onNavigate: (path: string) => void }) {
  const runtime = useLocalRuntime({
    run: async function* () {
      yield { content: [{ type: 'text' as const, text: 'Antwort' }] };
    },
  });
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <GrueneratorComposer variant="pill" onNavigate={onNavigate} />
    </AssistantRuntimeProvider>
  );
}

describe('GrueneratorComposer — Rezept-Bibliothek', () => {
  it('opens the Rezepte tab of the Marktplatz', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <Harness onNavigate={onNavigate} />
      </QueryClientProvider>
    );

    await user.click(screen.getByRole('button', { name: 'Aktionen und Modus' }));
    const menu = await screen.findByRole('menu');
    await user.hover(within(menu).getByRole('menuitem', { name: /Rezepte/ }));
    // Radix-Untermenü: im Zeiger-Pfad von jsdom ist der Eintrag per user.click nicht erreichbar.
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Zur Rezept-Bibliothek' }));

    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('/marktplatz?art=rezepte'));
  });
});
