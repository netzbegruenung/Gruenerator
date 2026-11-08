import {
  PUSH_NOTIFICATION_GROUPS,
  type NotifChannelPreferences,
  type PushGroupId,
} from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, StyleSheet, Switch, Text } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { disablePush, enablePush, isPushEnabled } from '../../services/push/pushRegistration';
import { spacing, colors, BODY_FONT } from '../../theme';
import { ListGroup, ListRow } from '../common/ListRow';

type Preferences = Record<string, NotifChannelPreferences>;

/** A group is on when every type in it pushes. */
function groupOn(prefs: Preferences, types: readonly string[]): boolean {
  return types.every((t) => prefs[t]?.push === true && prefs[t]?.in_app === true);
}

/** Flip push on this device; explains every way switching on can fail. */
async function switchDevice(value: boolean): Promise<boolean> {
  if (!value) {
    await disablePush();
    return false;
  }
  const result = await enablePush();
  if (result === 'denied') {
    Alert.alert(
      'Mitteilungen sind aus',
      'Erlaube dem Grünerator Mitteilungen in den Systemeinstellungen.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Einstellungen', onPress: () => void Linking.openSettings() },
      ]
    );
  } else if (result === 'unavailable') {
    Alert.alert('Nicht verfügbar', 'Push ist in dieser App-Version nicht verfügbar.');
  } else if (result === 'failed') {
    Alert.alert('Fehler', 'Push konnte nicht eingeschaltet werden.');
  }
  return result === 'enabled';
}

/**
 * App push for this device: one opt-in switch, then the four groups from
 * `PUSH_NOTIFICATION_GROUPS`. The groups write the same per-type preferences
 * the web shows; push needs in-app on as well (the server only pushes what the
 * bell shows), so switching a group on switches both.
 */
export function NotificationsDetail() {
  const theme = useTheme();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [prefs, setPrefs] = useState<Preferences | null>(null);

  useEffect(() => {
    void isPushEnabled().then(setEnabled);
    void getContractsClient()
      .notifications.getPreferences()
      .then((res) => {
        if (res.status === 200) setPrefs(res.body.preferences);
      })
      .catch(() => {});
  }, []);

  const toggleDevice = useCallback((value: boolean) => {
    setBusy(true);
    void switchDevice(value)
      .then(setEnabled)
      .catch(() => Alert.alert('Fehler', 'Push konnte nicht umgestellt werden.'))
      .finally(() => setBusy(false));
  }, []);

  const toggleGroup = useCallback(
    async (id: PushGroupId, value: boolean) => {
      const group = PUSH_NOTIFICATION_GROUPS.find((g) => g.id === id);
      if (!group || !prefs) return;
      const channels = value ? { push: true, in_app: true } : { push: false };
      const previous = prefs;
      const next = { ...prefs };
      for (const t of group.types) {
        const current = prefs[t] ?? { email: false, push: false, in_app: false };
        next[t] = { ...current, push: value, in_app: value || current.in_app };
      }
      setPrefs(next);
      const results = await Promise.all(
        group.types.map((category) =>
          getContractsClient()
            .notifications.updatePreferences({ body: { category, channels } })
            .then((res) => res.status === 200)
            .catch(() => false)
        )
      );
      if (results.some((ok) => !ok)) {
        setPrefs(previous);
        Alert.alert('Fehler', 'Einstellung konnte nicht gespeichert werden.');
      }
    },
    [prefs]
  );

  return (
    <>
      <Text style={[styles.note, { color: theme.textSecondary }]}>
        Push-Mitteilungen kommen verschlüsselt auf dieses Gerät. Apple bzw. Google sehen nur, dass
        eine Nachricht kommt – nicht, was drinsteht.
      </Text>
      <ListGroup>
        <ListRow
          icon="notifications-outline"
          title="Push auf diesem Gerät"
          value={enabled ? 'An' : 'Aus'}
          accessory={
            <Switch
              value={enabled === true}
              disabled={enabled === null || busy}
              onValueChange={toggleDevice}
              trackColor={{ true: colors.primary[600], false: colors.grey[300] }}
            />
          }
          last
        />
      </ListGroup>
      {enabled && prefs ? (
        <ListGroup>
          {PUSH_NOTIFICATION_GROUPS.map((group, i) => (
            <ListRow
              key={group.id}
              title={group.label}
              accessory={
                <Switch
                  value={groupOn(prefs, group.types)}
                  onValueChange={(value) => void toggleGroup(group.id, value)}
                  trackColor={{ true: colors.primary[600], false: colors.grey[300] }}
                  accessibilityLabel={group.label}
                />
              }
              last={i === PUSH_NOTIFICATION_GROUPS.length - 1}
            />
          ))}
        </ListGroup>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  note: {
    fontFamily: BODY_FONT,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.small,
  },
});
