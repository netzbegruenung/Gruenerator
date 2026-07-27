import { useAuth } from '@gruenerator/shared/hooks';
import { AT_EBENEN, DE_EBENEN, type UserRole } from '@gruenerator/shared/roles';
import { getSettingsEntry } from '@gruenerator/shared/settings';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';

import { SettingsGroup, SettingsRow, SettingsScreen } from '../../../components/settings';
import { useTheme } from '../../../hooks/useTheme';
import { fetchRoles } from '../../../services/roles';
import { spacing, colors, BODY_FONT } from '../../../theme';

/**
 * Roles, read-only.
 *
 * Creating one is a five-step wizard over four vocabularies (Ebene, Bundesland,
 * Gliederung, Rolle) plus an MdB lookup — a form to fill in at a desk, not on a
 * phone. Mobile shows what is set, because that is what changes how every answer
 * is written, and sends editing to the web app.
 */
export default function RollenScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const ebenen = user?.locale === 'de-AT' ? AT_EBENEN : DE_EBENEN;

  const [roles, setRoles] = useState<UserRole[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void fetchRoles().then((next) => {
        if (active) setRoles(next);
      });
      return () => {
        active = false;
      };
    }, [])
  );

  return (
    <SettingsScreen title={getSettingsEntry('personalisierung.rollen').title} canGoBack>
      <Text style={[styles.intro, { color: theme.textSecondary }]}>
        {getSettingsEntry('personalisierung.rollen').description}
      </Text>

      {roles === null ? (
        <ActivityIndicator size="small" color={colors.primary[600]} style={styles.loader} />
      ) : roles.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            Noch keine Rollen hinterlegt. Leg sie am Rechner unter Einstellungen → Personalisierung
            an.
          </Text>
        </View>
      ) : (
        <SettingsGroup>
          {roles.map((role, i) => {
            const ebene = ebenen.find((e) => e.id === role.ebene);
            const subtitle = [role.gliederung, role.bundesland, role.abgeordnete]
              .filter(Boolean)
              .join(' · ');
            return (
              <SettingsRow
                // Roles carry no id, and two can be identical (same office in two
                // Gliederungen with neither named). The list is read-only and
                // never reordered, so the index is a stable key here.
                // eslint-disable-next-line react/no-array-index-key
                key={`${role.ebene}-${role.rolle}-${i}`}
                icon={ebene ? 'ribbon-outline' : 'pin-outline'}
                title={role.rolle}
                value={subtitle || null}
                last={i === roles.length - 1}
              />
            );
          })}
        </SettingsGroup>
      )}
    </SettingsScreen>
  );
}

const styles = StyleSheet.create({
  intro: {
    fontFamily: BODY_FONT,
    fontSize: 13,
    lineHeight: 18,
  },
  loader: {
    paddingVertical: spacing.large,
  },
  empty: {
    paddingVertical: spacing.large,
  },
  emptyText: {
    fontFamily: BODY_FONT,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});
