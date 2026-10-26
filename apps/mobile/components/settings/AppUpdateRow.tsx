import Constants from 'expo-constants';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';

import { describeAppUpdate } from '../../services/appUpdate';
import { Updates, type UpdatesModule } from '../../services/expoUpdates';
import { ListRow } from '../common/ListRow';

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
  // must not be reached at all when the module is absent. The prop carries the
  // narrowed module for the non-hook fields; the hook itself is read through
  // `useExpoUpdates` because the compiler rejects a hook taken from props.
  return Updates ? <LinkedAppUpdateRow updates={Updates} /> : <VersionOnlyRow />;
}

// Only reached from LinkedAppUpdateRow, which renders only when the module loaded.
function useExpoUpdates() {
  return (Updates as UpdatesModule).useUpdates();
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
  } = useExpoUpdates();

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
