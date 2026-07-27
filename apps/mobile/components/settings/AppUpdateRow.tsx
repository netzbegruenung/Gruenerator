import Constants from 'expo-constants';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';

import { describeAppUpdate } from '../../services/appUpdate';
import { ListRow } from '../common/ListRow';

// Type-only, so it is erased at build time and never becomes a runtime import —
// which is the whole point of the `require` below.
import type * as ExpoUpdates from 'expo-updates';

type UpdatesModule = typeof ExpoUpdates;

/**
 * `expo-updates`, or null when this binary has no native side for it.
 *
 * `require`, not `import`, and that is the whole point: a static import is
 * hoisted and evaluated before any guard in this file could run, and the module
 * throws "Cannot find native module 'ExpoUpdates'" while it is being evaluated.
 * The stack said so exactly — `AppUpdateRow.tsx (2:1)`, the import line. Because
 * the settings sheet is reached from the root layout, that single throw took the
 * whole app down ("Route ./_layout.tsx is missing the required default export").
 *
 * Which binaries are affected: every one built before this dependency was added.
 * That is each developer's current dev client and the Maestro builds, so the row
 * has to survive its own absence rather than assume everyone rebuilt first. The
 * feature itself still needs a rebuild — this only decides whether the app
 * starts without one.
 *
 * Evaluated once at module scope: the answer cannot change while the app runs.
 */
const Updates: UpdatesModule | null = ((): UpdatesModule | null => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-updates') as UpdatesModule;
  } catch {
    return null;
  }
})();

/** The version, and nothing else — no native module to ask about updates. */
function VersionOnlyRow() {
  const row = describeAppUpdate({
    appVersion: Constants.expoConfig?.version ?? '—',
    isEnabled: false,
    isEmbeddedLaunch: true,
    createdAt: null,
    isChecking: false,
    isDownloading: false,
    isRestarting: false,
    isUpdateAvailable: false,
    isUpdatePending: false,
    hasError: false,
  });
  return <ListRow icon="cloud-download-outline" title="App-Version" value={row.value} last />;
}

/**
 * Version and update state, as the last row of the settings list.
 *
 * Over-the-air updates arrive on their own — this row is not how they get
 * installed, it is how you find out what is installed. Without it, "welcher
 * Stand läuft bei dir?" has no answer on a device, because the store version
 * stays the same across every update that ships under it.
 *
 * The manual check is the second reason: `checkAutomatically` runs on launch,
 * and an app that has been in the background for two days would otherwise sit
 * on an old bundle until it is cold-started.
 */
export function AppUpdateRow() {
  // Two components rather than a branch inside one: `useUpdates()` is a hook and
  // must not be reached at all when the module is absent. Passing the module as
  // a prop keeps the non-null narrowing without an assertion.
  return Updates ? <LinkedAppUpdateRow updates={Updates} /> : <VersionOnlyRow />;
}

function LinkedAppUpdateRow({ updates }: { updates: UpdatesModule }) {
  const {
    currentlyRunning,
    isChecking,
    isDownloading,
    isRestarting,
    isUpdateAvailable,
    isUpdatePending,
    checkError,
    downloadError,
  } = updates.useUpdates();

  // `checkForUpdateAsync` rejects rather than resolving false, so a failed
  // check has to be remembered here to survive into the next render.
  const [failed, setFailed] = useState(false);

  const row = describeAppUpdate({
    appVersion: Constants.expoConfig?.version ?? '—',
    isEnabled: updates.isEnabled,
    isEmbeddedLaunch: currentlyRunning.isEmbeddedLaunch,
    createdAt: currentlyRunning.createdAt ?? null,
    isChecking,
    isDownloading,
    isRestarting,
    isUpdateAvailable,
    isUpdatePending,
    hasError: failed || checkError != null || downloadError != null,
  });

  const handlePress = useCallback(() => {
    if (row.action === 'none') return;

    if (row.action === 'reload') {
      void updates.reloadAsync().catch(() => {
        Alert.alert('Fehler', 'Die App konnte nicht neu gestartet werden.');
      });
      return;
    }

    setFailed(false);
    void (async () => {
      try {
        if (row.action === 'download') {
          await updates.fetchUpdateAsync();
          return;
        }
        const result = await updates.checkForUpdateAsync();
        if (result.isAvailable) await updates.fetchUpdateAsync();
      } catch {
        setFailed(true);
      }
    })();
  }, [row.action, updates]);

  return (
    <ListRow
      icon="cloud-download-outline"
      title="App-Version"
      value={row.value}
      onPress={row.action === 'none' ? undefined : handlePress}
      last
    />
  );
}
