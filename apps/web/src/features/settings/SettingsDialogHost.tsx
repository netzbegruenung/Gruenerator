import { useQueryClient } from '@tanstack/react-query';
import { Suspense, lazy, useEffect } from 'react';

import { useSettingsDialogStore } from './settingsDialogStore';
import { loadSettingsShell, preloadSettingsEntry } from './settingsTabs';
import { useOnboarding } from './useOnboarding';

import { useAuthStore } from '@/stores/authStore';

const SettingsDialog = lazy(loadSettingsShell);

// Mounted once in App; loads the dialog chunk on first open and keeps it
// mounted afterwards so the Radix close animation can play.
const SettingsDialogHost = () => {
  const hasOpened = useSettingsDialogStore((s) => s.hasOpened);
  const tab = useSettingsDialogStore((s) => s.tab);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const queryClient = useQueryClient();
  // Kostenlos: useHydrateUserProfile zieht dieselbe Abfrage ohnehin beim Start.
  const { isActive: isOnboarding } = useOnboarding();

  // Solange die Einrichtung offen ist, ist SIE der Bereich, auf dem der Dialog
  // aufgeht — der Effekt unten läuft nur vor dem ersten Öffnen, es gibt hier
  // also noch keinen benannten Bereich, der vorginge. Die Entscheidung selbst
  // trifft resolveSettingsTab im Dialog; das hier wärmt nur den passenden Chunk
  // vor, und daneben zu liegen kostet höchstens einen Moment Skelett.
  const entryTab = isOnboarding ? 'onboarding' : tab;

  // Settings is behind login, so an authenticated session is the earliest
  // honest signal that this chunk will be wanted. Fetching it at the first idle
  // moment — after the route the user actually came for has settled — is what
  // makes the first open instant rather than a two-chunk waterfall. Hence also
  // the `fallback={null}` below: by the time anything can open the dialog, the
  // shell is in memory.
  useEffect(() => {
    if (!isAuthenticated || hasOpened) return;
    return preloadSettingsEntry(entryTab, queryClient);
  }, [isAuthenticated, hasOpened, entryTab, queryClient]);

  if (!hasOpened) return null;

  return (
    <Suspense fallback={null}>
      <SettingsDialog />
    </Suspense>
  );
};

export default SettingsDialogHost;
