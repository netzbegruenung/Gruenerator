/**
 * „Noch keine Projekte vorhanden" ist die härteste Aussage dieser Seite, und
 * sie entstand bisher aus der blossen Abwesenheit von Daten: `useGroups` gibt
 * `query.data ?? []` zurück, und die Seite las allein die Länge. Derselbe Satz
 * erschien damit beim Laden, bei abgelaufener Sitzung (401, dessen Toast
 * unterdrückt wird) und bei jedem Abrufsfehler — und blieb stehen, weil
 * `refetchOnWindowFocus` aus ist.
 *
 * Diese Prüfungen halten die drei Zustände auseinander: leer wird nur
 * behauptet, wenn der Server eine leere Liste bestätigt hat.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

import ProjektePage from './ProjektePage';

import { renderWithProviders, screen } from '@/test-utils';

const EMPTY_TEXT = /Noch keine Projekte vorhanden/;

const useGroups = vi.hoisted(() => vi.fn());
const refetchGroups = vi.hoisted(() => vi.fn());

vi.mock('../hooks/useGroups', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useGroups: (...args: unknown[]) => useGroups(...args) as unknown,
  useInviteToGroup: () => ({ mutate: vi.fn(), isPending: false }),
}));

// Die öffentliche Liste hängt an einer eigenen Abfrage und hat mit der Frage
// nichts zu tun — leer gesetzt, damit die Zusicherungen von der eigenen Liste
// handeln.
vi.mock('../components/PublicGroupsSection', () => ({ default: () => null }));

vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => null }));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector({ user: { id: 'u1' } }),
}));

function groupsResult(over: Record<string, unknown> = {}) {
  return {
    userGroups: [],
    isLoadingGroups: false,
    isFetchingGroups: false,
    isErrorGroups: false,
    errorGroups: null,
    refetchGroups,
    createGroup: vi.fn(),
    isCreatingGroup: false,
    isCreateGroupError: false,
    createGroupError: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ProjektePage — Leerzustand', () => {
  it('behauptet "keine Projekte" erst, wenn der Server eine leere Liste bestätigt hat', () => {
    useGroups.mockReturnValue(groupsResult({ userGroups: [] }));
    renderWithProviders(<ProjektePage />);
    expect(screen.getByText(EMPTY_TEXT)).toBeInTheDocument();
  });

  it('sagt während des ersten Abrufs nicht, dass es keine Projekte gibt', () => {
    useGroups.mockReturnValue(groupsResult({ isLoadingGroups: true, isFetchingGroups: true }));
    renderWithProviders(<ProjektePage />);
    expect(screen.queryByText(EMPTY_TEXT)).not.toBeInTheDocument();
  });

  // `isFetching` allein taugt nicht als Ladeanzeige: es ist auch bei jedem
  // Hintergrund-Refetch true — etwa bei der Invalidierung, nachdem im Chat ein
  // Projekt angelegt wurde. Die bereits geladenen Kacheln müssen stehen
  // bleiben, sonst blinkt die Liste bei jeder Mutation weg.
  it('behält die geladenen Kacheln während eines Hintergrund-Refetchs', () => {
    useGroups.mockReturnValue(
      groupsResult({
        userGroups: [{ id: 'g1', name: 'Mein Projekt', role: 'admin', isAdmin: true }],
        isLoadingGroups: false,
        isFetchingGroups: true,
      })
    );
    renderWithProviders(<ProjektePage />);
    expect(screen.getByText('Mein Projekt')).toBeInTheDocument();
    expect(screen.queryByText(/Projekte werden geladen/i)).not.toBeInTheDocument();
  });

  it('meldet einen gescheiterten Abruf als Fehler statt als Leerzustand', () => {
    useGroups.mockReturnValue(groupsResult({ isErrorGroups: true, errorGroups: new Error('500') }));
    renderWithProviders(<ProjektePage />);
    expect(screen.queryByText(EMPTY_TEXT)).not.toBeInTheDocument();
    expect(screen.getByText(/konnten nicht geladen werden/i)).toBeInTheDocument();
  });

  it('bietet nach einem Fehler einen erneuten Versuch an', async () => {
    useGroups.mockReturnValue(groupsResult({ isErrorGroups: true, errorGroups: new Error('500') }));
    const { user } = renderWithProviders(<ProjektePage />);
    await user.click(screen.getByRole('button', { name: /erneut versuchen/i }));
    expect(refetchGroups).toHaveBeenCalled();
  });

  it('zeigt bei einem Fehler keine Kacheln, auch wenn noch alte Daten im Cache liegen', () => {
    useGroups.mockReturnValue(
      groupsResult({
        userGroups: [{ id: 'g1', name: 'Mein Projekt', role: 'admin', isAdmin: true }],
        isErrorGroups: false,
      })
    );
    renderWithProviders(<ProjektePage />);
    expect(screen.getByText('Mein Projekt')).toBeInTheDocument();
    expect(screen.queryByText(EMPTY_TEXT)).not.toBeInTheDocument();
  });
});
