/* eslint-disable import-x/order -- `@jest/globals` MUSS der erste Import bleiben.
   babel-plugin-jest-hoist zieht die `jest.mock`-Aufrufe unten über die übrigen
   requires; nur ein `@jest/globals`-require, das ihnen bereits vorausgeht,
   übersteht diesen Umzug. Begründung ausführlich in ConfirmActionCard.test.tsx. */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useAuthStore } from '@gruenerator/shared/stores';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { LocaleGate } from './LocaleGate';

jest.mock('@gruenerator/shared/stores', () => ({ useAuthStore: jest.fn() }));

/**
 * Geprüft wird, wann die Frage kommt (nur ohne Land, erst nach der
 * Einwilligung) und dass die Antwort gespeichert wird — #2920.
 */

const updateLocale = jest.fn<(locale: string) => Promise<void>>();

function mockStore(user: Record<string, unknown> | null): void {
  (useAuthStore as unknown as jest.Mock).mockImplementation((selector: unknown) =>
    (selector as (s: Record<string, unknown>) => unknown)({ user, updateLocale })
  );
}

const TITLE = 'In welchem Land bist Du grün aktiv?';
const CONSENTED = '2026-01-01T00:00:00.000Z';

beforeEach(() => {
  jest.clearAllMocks();
  updateLocale.mockResolvedValue(undefined);
});

describe('LocaleGate (mobile)', () => {
  it('bleibt weg, wenn das Profil ein Land trägt', () => {
    mockStore({ ai_consent_at: CONSENTED, locale: 'de-AT' });
    render(<LocaleGate />);
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it('bleibt weg, solange niemand angemeldet ist', () => {
    mockStore(null);
    render(<LocaleGate />);
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it('lässt der Einwilligung den Vortritt', () => {
    mockStore({ ai_consent_at: null, locale: null });
    render(<LocaleGate />);
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it('fragt, wenn das Land fehlt, und unterstellt keins', () => {
    mockStore({ ai_consent_at: CONSENTED, locale: null });
    render(<LocaleGate />);
    expect(screen.getByText(TITLE)).toBeTruthy();
    expect(updateLocale).not.toHaveBeenCalled();
  });

  it('speichert die Wahl', async () => {
    mockStore({ ai_consent_at: CONSENTED, locale: null });
    render(<LocaleGate />);

    fireEvent.press(screen.getByText('Österreich'));
    await waitFor(() => expect(updateLocale).toHaveBeenCalledWith('de-AT'));
  });

  it('meldet einen Fehler beim Speichern', async () => {
    updateLocale.mockRejectedValueOnce(new Error('offline'));
    mockStore({ ai_consent_at: CONSENTED, locale: null });
    render(<LocaleGate />);

    fireEvent.press(screen.getByText('Deutschland'));
    expect(await screen.findByText('Das Land konnte nicht gespeichert werden.')).toBeTruthy();
  });
});
