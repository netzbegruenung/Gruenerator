import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';

import { describeAppUpdate } from '../../services/appUpdate';
import { ListRow } from '../common/ListRow';

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
  const {
    currentlyRunning,
    isChecking,
    isDownloading,
    isRestarting,
    isUpdateAvailable,
    isUpdatePending,
    checkError,
    downloadError,
  } = Updates.useUpdates();

  // `checkForUpdateAsync` rejects rather than resolving false, so a failed
  // check has to be remembered here to survive into the next render.
  const [failed, setFailed] = useState(false);

  const row = describeAppUpdate({
    appVersion: Constants.expoConfig?.version ?? '—',
    isEnabled: Updates.isEnabled,
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
      void Updates.reloadAsync().catch(() => {
        Alert.alert('Fehler', 'Die App konnte nicht neu gestartet werden.');
      });
      return;
    }

    setFailed(false);
    void (async () => {
      try {
        if (row.action === 'download') {
          await Updates.fetchUpdateAsync();
          return;
        }
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) await Updates.fetchUpdateAsync();
      } catch {
        setFailed(true);
      }
    })();
  }, [row.action]);

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
