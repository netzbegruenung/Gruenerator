import { create } from 'zustand';

import type { EmbedPlatform, PlatformConsent } from '../types/consent';

const CONSENT_STORAGE_KEY = 'gruenerator-sites-embed-consent';

interface ConsentStore {
  consents: Record<string, PlatformConsent>;
  grantConsent: (platform: EmbedPlatform, remember: boolean) => void;
  revokeConsent: (platform: EmbedPlatform) => void;
  hasConsent: (platform: EmbedPlatform) => boolean;
  loadFromStorage: () => void;
}

const loadStoredConsents = (): Record<string, PlatformConsent> => {
  try {
    const stored = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore parse errors
  }
  return {};
};

const saveToStorage = (consents: Record<string, PlatformConsent>) => {
  try {
    const toStore: Record<string, PlatformConsent> = {};
    for (const [platform, consent] of Object.entries(consents)) {
      if (consent.remember) {
        toStore[platform] = consent;
      }
    }
    if (Object.keys(toStore).length > 0) {
      localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(toStore));
    } else {
      localStorage.removeItem(CONSENT_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors
  }
};

export const useConsentStore = create<ConsentStore>((set, get) => ({
  consents: loadStoredConsents(),

  grantConsent: (platform, remember) => {
    set((state) => {
      const newConsents = {
        ...state.consents,
        [platform]: {
          granted: true,
          remember,
          timestamp: new Date().toISOString(),
        },
      };
      saveToStorage(newConsents);
      return { consents: newConsents };
    });
  },

  revokeConsent: (platform) => {
    set((state) => {
      const newConsents = { ...state.consents };
      delete newConsents[platform];
      saveToStorage(newConsents);
      return { consents: newConsents };
    });
  },

  hasConsent: (platform) => {
    return get().consents[platform]?.granted === true;
  },

  loadFromStorage: () => {
    set({ consents: loadStoredConsents() });
  },
}));
