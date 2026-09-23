/* eslint-disable import-x/order -- `@jest/globals` MUSS der erste Import bleiben.
   babel-plugin-jest-hoist zieht die `jest.mock`-Aufrufe unten über die übrigen
   requires; nur ein `@jest/globals`-require, das ihnen bereits vorausgeht,
   übersteht diesen Umzug. Begründung ausführlich in ConfirmActionCard.test.tsx. */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useAuthStore } from '@gruenerator/shared/stores';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { logout } from '../../services/auth';

import { AiConsentGate } from './AiConsentGate';

jest.mock('@gruenerator/shared/stores', () => ({ useAuthStore: jest.fn() }));
jest.mock('../../services/auth', () => ({ logout: jest.fn() }));

/**
 * Das Pendant zu `apps/web/.../AiConsentGate.vitest.tsx`, und aus demselben
 * Grund: geprüft wird, was die Einwilligung nach Art. 9 Abs. 2 lit. a DSGVO
 * wirksam macht, nicht wie der Dialog aussieht.
 *
 * Die drei Eigenschaften, die hier hängen: sie erscheint nur, wenn sie fehlt;
 * sie ist ausdrücklich (ohne Haken passiert nichts); und sie ist freiwillig —
 * es gibt einen Ausgang, ohne den sie es nicht wäre (Art. 7 Abs. 4 DSGVO).
 */

const setAiConsent = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockLogout = logout as jest.MockedFunction<typeof logout>;

function mockStore(user: Record<string, unknown> | null): void {
  (useAuthStore as unknown as jest.Mock).mockImplementation((selector: unknown) =>
    (selector as (s: Record<string, unknown>) => unknown)({ user, setAiConsent })
  );
}

const TITLE = 'Bevor es losgeht: Deine Einwilligung';
const CONFIRM = 'Einwilligen und fortfahren';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('AiConsentGate (mobile)', () => {
  it('bleibt weg, wenn die Einwilligung vorliegt', () => {
    mockStore({ ai_consent_at: '2026-01-01T00:00:00.000Z' });
    render(<AiConsentGate />);
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it('bleibt weg, solange niemand angemeldet ist', () => {
    mockStore(null);
    render(<AiConsentGate />);
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it('fragt, sobald die Einwilligung fehlt', () => {
    mockStore({ ai_consent_at: null });
    render(<AiConsentGate />);
    expect(screen.getByText(TITLE)).toBeTruthy();
  });

  // Der einzige Test hier, der an einem Wortlaut haengt, und zwar mit Absicht:
  // der Erinnerungshinweis nach Art. 50 Abs. 4 KI-VO stand frueher unter jedem
  // Eingabefeld und steht seitdem NUR noch hier. Faellt er weg, faellt er
  // ersatzlos weg — das ist kein Schoenheitsfehler, sondern genau die
  // redaktionelle Kontrolle, auf die sich die Ausnahme von der
  // Kennzeichnungspflicht stuetzt. Geprueft wird die Aussage, nicht der Satzbau.
  it('nennt die redaktionelle Pruefung, die die Kennzeichnung ersetzt', () => {
    mockStore({ ai_consent_at: null });
    render(<AiConsentGate />);
    expect(screen.getByText(/Art\. 50 Abs\. 4 KI-VO/)).toBeTruthy();
    expect(screen.getByText(/bevor Du sie ver\u00f6ffentlichst/)).toBeTruthy();
  });

  // `await waitFor` und nicht bloß `expect`: der Bestätigen-Pfad setzt nach dem
  // await noch `saving` zurück. Ohne das Abwarten landet dieses setState nach
  // dem Testende und React meldet eine act()-Warnung — eine, die man sich
  // angewöhnt zu überlesen, und dann übersieht man die echten.
  it('bestätigt erst nach dem Haken', async () => {
    mockStore({ ai_consent_at: null });
    render(<AiConsentGate />);

    fireEvent.press(screen.getByText(CONFIRM));
    expect(setAiConsent).not.toHaveBeenCalled();

    fireEvent.press(screen.getByRole('checkbox'));
    fireEvent.press(screen.getByText(CONFIRM));
    await waitFor(() => expect(setAiConsent).toHaveBeenCalledWith(true));
  });

  it('lässt sich ohne Einwilligung verlassen', () => {
    mockStore({ ai_consent_at: null });
    render(<AiConsentGate />);

    fireEvent.press(screen.getByText('Ohne Einwilligung abmelden'));
    expect(mockLogout).toHaveBeenCalled();
    expect(setAiConsent).not.toHaveBeenCalled();
  });
});
