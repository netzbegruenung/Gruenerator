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

import { notifyAiConsentRequired } from './aiConsentSignal.js';

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
});
