import { Dialog, DialogContent, DialogTitle } from '@gruenerator/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import RolesSection from './RolesSection';

/**
 * Der Bundesland-Schritt des Rollen-Assistenten ist der einzige ohne
 * „Weiter"-Knopf: die Auswahlliste IST der Weg. Schließt sie sich beim Klick ins
 * Feld, steht der Assistent — genau das ist AT-Nutzer*innen bei „Wien"
 * passiert. Deshalb prüft der Test das Öffnen und das Weiterkommen getrennt.
 *
 * **Gerendert wird im Dialog, nicht nackt.** Die Sektion begegnet Nutzer*innen
 * nur im Einstellungs-Dialog, und der ist keine Kulisse: Radix sperrt für die
 * Dauer des Dialogs `body { pointer-events: none }`, während das Combobox-Popup
 * von Base UI per Portal daneben ins <body> geht. Nackt gerendert lief dieser
 * Test grün, während die Liste in der Anwendung sichtbar, aber tot war —
 * user-event weigert sich, auf `pointer-events: none` zu klicken, und ist damit
 * das Prüfmittel für genau diesen Fehler.
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
  const onOpenChange = vi.fn();
  render(
    // Router, weil die Sektion auf die zugeteilten Rezepte und Grüneratoren
    // verlinkt — ohne ihn wirft `useNavigate` schon beim Rendern.
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <Dialog open onOpenChange={onOpenChange}>
          <DialogContent>
            <DialogTitle>Einstellungen</DialogTitle>
            <RolesSection />
          </DialogContent>
        </Dialog>
      </QueryClientProvider>
    </MemoryRouter>
  );
  return { onOpenChange };
}

async function openBundeslandStep(user: ReturnType<typeof userEvent.setup>) {
  const { onOpenChange } = renderSection();
  await user.click(screen.getByRole('button', { name: /Erste Rolle hinzufügen/ }));
  await user.click(screen.getByText('Land'));
  return { input: screen.getByPlaceholderText('Bundesland eingeben...'), onOpenChange };
}

describe('RolesSection — Rollen-Assistent (de-AT)', () => {
  it('hält die Bundesland-Liste beim Klick ins Feld offen', async () => {
    const user = userEvent.setup();
    const { input } = await openBundeslandStep(user);

    await user.click(input);

    expect(await screen.findByRole('option', { name: 'Wien' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Burgenland' })).toBeInTheDocument();
  });

  // Der eigentliche Fehler: die Liste war da und ließ sich nicht anklicken.
  // `user.click` bricht auf `pointer-events: none` ab — der Test scheitert also
  // an derselben Stelle wie die Nutzerin, nicht an einer Ersatzbedingung.
  it('lässt das Bundesland im Dialog anklicken', async () => {
    const user = userEvent.setup();
    const { input, onOpenChange } = await openBundeslandStep(user);

    await user.click(input);
    await user.click(await screen.findByRole('option', { name: 'Wien' }));

    expect(screen.getByText('Was ist deine Rolle?')).toBeInTheDocument();
    // Und der Klick ins portalierte Popup darf die Einstellungen nicht
    // zuschlagen — für den Dialog liegt er außerhalb seines DOM-Teilbaums.
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('führt von Wien weiter zu den österreichischen Rollen', async () => {
    const user = userEvent.setup();
    const { input } = await openBundeslandStep(user);

    await user.type(input, 'Wien');
    await user.click(await screen.findByText('Wien'));

    expect(screen.getByText('Was ist deine Rolle?')).toBeInTheDocument();
    expect(screen.getByText('Mitarbeiter*in Landesorganisation')).toBeInTheDocument();
  });
});

/**
 * Vergibt die Instanz ihre eine Rolle selbst, gibt es hier nichts mehr zu tun:
 * kein „Hinzufügen" (die eine Rolle steht schon da) und kein Löschknopf — der
 * Server schriebe sie beim nächsten Lesen der User-Defaults zurück, der Knopf
 * wäre also eine Lüge.
 */
describe('RolesSection auf einer Instanz, die ihre Rolle selbst vergibt', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('../../../config/instance');
    vi.doUnmock('../../user-defaults/userDefaultsQueries');
  });

  it('zeigt die gesetzte Rolle ohne Hinzufügen und ohne Entfernen', async () => {
    vi.doMock('../../../config/instance', () => ({ CURRENT_INSTANCE: 'bgst' }));
    vi.doMock('../../user-defaults/userDefaultsQueries', () => ({
      useUserDefault: () => ({
        value: [{ ebene: 'bund', rolle: 'Mitarbeiter*in Bundesgeschäftsstelle' }],
      }),
      useSetUserDefault: () => ({ mutateAsync: vi.fn() }),
    }));

    // Nach `resetModules` bekommt die frisch geladene Sektion eine eigene Kopie
    // von react-query — der oben statisch importierte Provider spannte einen
    // Context auf, den sie nicht sieht („No QueryClient set"). Also beide aus
    // demselben Ladevorgang holen.
    const { default: Section } = await import('./RolesSection');
    const { QueryClient: FreshClient, QueryClientProvider: FreshProvider } =
      await import('@tanstack/react-query');

    const queryClient = new FreshClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter>
        <FreshProvider client={queryClient}>
          <Dialog open onOpenChange={vi.fn()}>
            <DialogContent>
              <DialogTitle>Einstellungen</DialogTitle>
              <Section />
            </DialogContent>
          </Dialog>
        </FreshProvider>
      </MemoryRouter>
    );

    expect(screen.getByText('Mitarbeiter*in Bundesgeschäftsstelle')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /entfernen/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Hinzufügen/ })).toBeNull();
  });
});
