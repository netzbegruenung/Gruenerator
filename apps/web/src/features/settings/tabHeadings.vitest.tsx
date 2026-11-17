/**
 * Invariant: every settings tab body opens with an h2 (its section heading),
 * never an h1 or h3 — SettingsDialog carries the dialog title, sections carry
 * h2, nested steps use h3. Tabs are mounted with empty API answers; the first
 * heading that appears once the tab left its skeleton is the one checked.
 */
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { http, HttpResponse } from 'msw';
import { type ComponentType } from 'react';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { server } from '../../test/msw-server';

import AccountTab from './tabs/AccountTab';
import BackgroundTab from './tabs/BackgroundTab';
import BriefingTab from './tabs/BriefingTab';
import ConnectorsTab from './tabs/ConnectorsTab';
import FriendsTab from './tabs/FriendsTab';
import GeneralTab from './tabs/GeneralTab';
import LetterheadsSection from './tabs/LetterheadsSection';
import MemoriesSection from './tabs/MemoriesSection';
import OnboardingTab from './tabs/OnboardingTab';
import PersonalizationTab from './tabs/PersonalizationTab';
import PrivacyTab from './tabs/PrivacyTab';
import SupportTab from './tabs/SupportTab';
import UsageTab from './tabs/UsageTab';
import WebsitesTab from './tabs/WebsitesTab';
import WolkeTab from './tabs/WolkeTab';

import { useAuthStore } from '@/stores/authStore';
import { renderWithProviders, screen, waitFor } from '@/test-utils';

// Not mounted: NotificationsTab (static import trips a notificationConfig import
// cycle in isolation) and AntragsgruenTab (needs a /health stub; its own suite
// asserts its h2).
const TABS: [string, ComponentType][] = [
  ['allgemein', GeneralTab],
  ['konto', AccountTab],
  ['hintergrund', BackgroundTab],
  ['personalisierung', PersonalizationTab],
  ['tagesbriefing', BriefingTab],
  ['friends', FriendsTab],
  ['datenschutz', PrivacyTab],
  ['nutzung', UsageTab],
  ['support', SupportTab],
  ['konnektoren', ConnectorsTab],
  ['briefe', LetterheadsSection],
  ['erinnerungen', MemoriesSection],
  ['onboarding', OnboardingTab],
  ['websites', WebsitesTab],
  ['wolke', WolkeTab],
];

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

beforeEach(() => {
  useAuthStore.setState({ user: { id: 'u1' } as never });
  server.use(http.all('http://localhost/api/*', () => HttpResponse.json({ id: 'u1' })));
});

describe('settings tab headings', () => {
  it.each(TABS)('%s opens with an h2', async (_name, Tab) => {
    renderWithProviders(<Tab />);
    await waitFor(() => expect(screen.getAllByRole('heading').length).toBeGreaterThan(0));
    expect(screen.getAllByRole('heading')[0].tagName).toBe('H2');
  });
});
