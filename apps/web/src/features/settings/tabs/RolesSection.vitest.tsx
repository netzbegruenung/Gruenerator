import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import RolesSection from './RolesSection';

/**
 * Der Bundesland-Schritt des Rollen-Assistenten ist der einzige ohne
 * „Weiter"-Knopf: die Auswahlliste IST der Weg. Schließt sie sich beim Klick ins
 * Feld, steht der Assistent — genau das ist AT-Nutzer*innen bei „Wien"
 * passiert. Deshalb prüft der Test das Öffnen und das Weiterkommen getrennt.
 */

vi.mock('../../../stores/authStore', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ locale: 'de-AT', user: { id: 'u1' } }),
}));

vi.mock('../../user-defaults/userDefaultsQueries', () => ({
  useUserDefault: () => ({ value: [] }),
  useSetUserDefault: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('../../../utils/platformFetch', () => ({
  platformFetch: vi.fn().mockResolvedValue({ ok: false }),
}));

vi.mock('@gruenerator/shared/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getContractsClient: () => ({ userProfile: { updateProfile: vi.fn() } }),
}));

vi.mock('../../../features/auth/services/profileApiService', () => ({
  profileApiService: { getProfile: vi.fn().mockResolvedValue({}) },
}));

function renderSection() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <RolesSection />
    </QueryClientProvider>
  );
}

async function openBundeslandStep(user: ReturnType<typeof userEvent.setup>) {
  renderSection();
  await user.click(screen.getByRole('button', { name: /Erste Rolle hinzufügen/ }));
  await user.click(screen.getByText('Land'));
  return screen.getByPlaceholderText('Bundesland eingeben...');
}

describe('RolesSection — Rollen-Assistent (de-AT)', () => {
  it('hält die Bundesland-Liste beim Klick ins Feld offen', async () => {
    const user = userEvent.setup();
    const input = await openBundeslandStep(user);

    await user.click(input);

    expect(await screen.findByRole('option', { name: 'Wien' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Burgenland' })).toBeInTheDocument();
  });

  it('führt von Wien weiter zu den österreichischen Rollen', async () => {
    const user = userEvent.setup();
    const input = await openBundeslandStep(user);

    await user.type(input, 'Wien');
    await user.click(await screen.findByText('Wien'));

    expect(screen.getByText('Was ist deine Rolle?')).toBeInTheDocument();
    expect(screen.getByText('Mitarbeiter*in Landesorganisation')).toBeInTheDocument();
  });
});
