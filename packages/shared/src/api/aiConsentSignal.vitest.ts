/**
 * Die Absage „Einwilligung fehlt" (HTTP 403) muss im Auth-Store ankommen, sonst
 * bleibt sie ein Fehler ohne Ausweg: der Einwilligungs-Dialog hängt an genau
 * einer Bedingung — `user.ai_consent_at == null` — und wenn der Store weiter
 * einen Zeitstempel hält, sieht die Nutzer*in nur, dass nichts geht.
 *
 * Geprüft wird deshalb die Verdrahtung, nicht die Weiterleitung an sich: dass
 * der geteilte Store sich beim Laden selbst einträgt (Mobile erbt das) und dass
 * ein Signal den Zeitstempel tatsächlich zurücksetzt.
 */
import { describe, expect, it } from 'vitest';

import { useAuthStore } from '../stores/authStore.js';

import { notifyAiConsentRequired, registerAiConsentRequiredHandler } from './aiConsentSignal.js';

import type { User } from '../types/auth.js';

const user = (ai_consent_at: string | null): User =>
  ({ id: 'u1', email: 'a@b.c', ai_consent_at }) as unknown as User;

describe('notifyAiConsentRequired', () => {
  it('zieht den Einwilligungs-Zeitstempel im geteilten Store auf null', () => {
    useAuthStore.setState({ user: user('2026-08-10T10:00:00.000Z'), isAuthenticated: true });

    notifyAiConsentRequired();

    expect(useAuthStore.getState().user?.ai_consent_at).toBeNull();
  });

  it('lässt einen leeren Store unangetastet', () => {
    useAuthStore.setState({ user: null, isAuthenticated: false });

    notifyAiConsentRequired();

    expect(useAuthStore.getState().user).toBeNull();
  });

  // Web und Mobile halten verschiedene Auth-Stores und tragen sich beide beim
  // Modul-Laden ein. Mit einem einzelnen Platz hinge es an der Reihenfolge des
  // Bundlers, wessen Eintrag überlebt — und der verlierende Store zeigte den
  // Dialog nie wieder. Deshalb: alle werden benachrichtigt.
  it('benachrichtigt jeden eingetragenen Empfänger, nicht nur den letzten', () => {
    const seen: string[] = [];
    const offA = registerAiConsentRequiredHandler(() => seen.push('a'));
    const offB = registerAiConsentRequiredHandler(() => seen.push('b'));

    notifyAiConsentRequired();

    expect(seen).toEqual(['a', 'b']);
    offA();
    offB();
  });

  it('lässt einen abgemeldeten Empfänger aus', () => {
    const seen: string[] = [];
    const off = registerAiConsentRequiredHandler(() => seen.push('a'));
    off();

    notifyAiConsentRequired();

    expect(seen).toEqual([]);
  });
});
