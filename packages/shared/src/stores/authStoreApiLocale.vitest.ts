/**
 * Mobile nutzt diesen Store. Ohne `setApiLocale` schickte die App bei jeder
 * Anfrage `X-User-Locale: de-DE`, auch für österreichische Profile.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { getApiLocale, setApiLocale } from '../api/locale.js';

import { setAuthStoreConfig, useAuthStore } from './authStore.js';

import type { User } from '../types/auth.js';

afterEach(() => setApiLocale('de-DE'));

describe('authStore → X-User-Locale', () => {
  it('übernimmt das Profil-Land beim Login', () => {
    useAuthStore.getState().setAuthState({ user: { id: 'u', locale: 'de-AT' } as User });
    expect(getApiLocale()).toBe('de-AT');
  });

  it('zieht bei einer Länderänderung mit', async () => {
    setAuthStoreConfig({ updateLocaleApi: () => Promise.resolve() });
    useAuthStore.getState().setAuthState({ user: { id: 'u', locale: 'de-DE' } as User });
    await useAuthStore.getState().updateLocale('de-AT');
    expect(getApiLocale()).toBe('de-AT');
  });
});
