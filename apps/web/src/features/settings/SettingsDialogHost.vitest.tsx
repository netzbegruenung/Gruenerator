import { waitFor } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import SettingsDialogHost from './SettingsDialogHost';

import { useAuthStore } from '@/stores/authStore';
import { server } from '@/test/msw-server';
import { renderWithProviders } from '@/test-utils';

/**
 * Der Vorabruf der Einstellungen hängt am Einrichtungs-Zustand, und der
 * Einrichtungs-Vorabruf fragt genau die User-Defaults ab, aus denen dieser
 * Zustand gelesen wird. Scheiterte die Abfrage, schaukelten sich beide auf:
 * 350–1400 Anfragen pro Sekunde, ohne Pause (#4846).
 */

// jsdom kennt kein requestIdleCallback; mit dem 300-ms-Rückfall drehte die
// Schleife hier nur wenige Runden. Sofort ausgeführt zeigt sie sich deutlich.
vi.mock('@/utils/whenIdle', () => ({
  whenIdle: (task: () => void) => {
    const handle = setTimeout(task, 0);
    return () => clearTimeout(handle);
  },
}));

const calls = { userDefaults: 0, profile: 0, shareLinks: 0 };

// Ohne Latenz kommt die Antwort, bevor React den Zwischenstand `pending`
// überhaupt rendert — dann kippt nichts, und die Schleife bleibt unsichtbar.
const LATENCY_MS = 10;

function serveUserDefaults(response: () => Response) {
  server.use(
    http.get('http://localhost/api/auth/profile/user-defaults', async () => {
      calls.userDefaults += 1;
      await delay(LATENCY_MS);
      return response();
    }),
    http.get('http://localhost/api/auth/profile', async () => {
      calls.profile += 1;
      await delay(LATENCY_MS);
      return HttpResponse.json({ success: false }, { status: 404 });
    }),
    http.get('http://localhost/api/nextcloud/share-links', async () => {
      calls.shareLinks += 1;
      await delay(LATENCY_MS);
      return HttpResponse.json({ success: false }, { status: 404 });
    })
  );
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 300));

// Der erste Import der Reiter-Chunks braucht hier mehrere Sekunden; ohne
// Vorwärmen läuft jede Messung ab, bevor der Vorabruf überhaupt startet.
beforeAll(async () => {
  await import('./tabs/OnboardingTab');
  await import('./tabs/GeneralTab');
}, 30_000);

beforeEach(() => {
  calls.userDefaults = 0;
  calls.profile = 0;
  calls.shareLinks = 0;
  useAuthStore.setState({ isAuthenticated: true, user: { id: 'u1' } as never });
});

afterEach(() => {
  useAuthStore.setState({ isAuthenticated: false, user: null });
});

describe('SettingsDialogHost preload', () => {
  it('fetches failing user defaults once instead of in a loop', async () => {
    serveUserDefaults(() => HttpResponse.json({ success: false }, { status: 404 }));
    renderWithProviders(<SettingsDialogHost />);

    await waitFor(() => expect(calls.userDefaults).toBeGreaterThan(0));
    await settle();

    expect(calls.userDefaults).toBe(1);
    expect(calls.shareLinks).toBe(0);
  });

  it('still warms the setup when it is open', async () => {
    serveUserDefaults(() =>
      HttpResponse.json({ userDefaults: { profile: { onboardingCompleted: false } } })
    );
    renderWithProviders(<SettingsDialogHost />);

    await waitFor(() => expect(calls.shareLinks).toBeGreaterThan(0));
    await settle();

    expect(calls.userDefaults).toBe(1);
    expect(calls.shareLinks).toBe(1);
  });
});
