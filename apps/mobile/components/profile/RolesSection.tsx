import { useAuth } from '@gruenerator/shared/hooks';
import { AT_EBENEN, DE_EBENEN, type UserRole } from '@gruenerator/shared/roles';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  useColorScheme,
  Alert,
  ActivityIndicator,
} from 'react-native';

import { fetchRoles, persistRoles } from '../../services/roles';
import { colors, spacing, borderRadius, lightTheme, darkTheme } from '../../theme';

export function RolesSection() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const router = useRouter();
  const { user } = useAuth();
  const isAustrian = user?.locale === 'de-AT';
  const ebenen = isAustrian ? AT_EBENEN : DE_EBENEN;

  const [roles, setRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);

  // Re-read on focus so a role added in the modal shows immediately on return.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        const next = await fetchRoles();
        if (active) {
          setRoles(next);
          setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [])
  );

  const handleDelete = useCallback(
    (index: number) => {
      const role = roles[index];
      Alert.alert('Rolle entfernen', `"${role.rolle}" wirklich entfernen?`, [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Entfernen',
          style: 'destructive',
          onPress: () => {
            const prev = roles;
            const next = roles.filter((_, i) => i !== index);
            setRoles(next);
            void persistRoles(next, isAustrian).catch(() => {
              setRoles(prev);
              Alert.alert('Fehler', 'Rolle konnte nicht entfernt werden.');
            });
          },
        },
      ]);
    },
    [roles, isAustrian]
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: theme.text }]}>Deine Rollen</Text>
          <Text style={[styles.description, { color: theme.textSecondary }]}>
            Definiere deine Rollen — der Grünerator passt sich automatisch an.
          </Text>
        </View>
        {roles.length > 0 && (
          <Pressable
            onPress={() => router.push('/(modals)/role-add' as Href)}
            hitSlop={8}
            style={styles.addIconButton}
            accessibilityLabel="Rolle hinzufügen"
            accessibilityRole="button"
          >
            <Ionicons name="add" size={24} color={colors.primary[600]} />
          </Pressable>
        )}
      </View>

      {loading ? (
        <ActivityIndicator size="small" color={colors.primary[600]} style={styles.loader} />
      ) : roles.length === 0 ? (
        <Pressable
          onPress={() => router.push('/(modals)/role-add' as Href)}
          style={({ pressed }) => [
            styles.emptyButton,
            {
              borderColor: colors.primary[600],
              backgroundColor: pressed ? theme.surface : 'transparent',
            },
          ]}
        >
          <Ionicons name="add" size={18} color={colors.primary[600]} />
          <Text style={[styles.emptyButtonText, { color: colors.primary[600] }]}>
            Erste Rolle hinzufügen
          </Text>
        </Pressable>
      ) : (
        <View style={styles.list}>
          {roles.map((role, i) => {
            const ebene = ebenen.find((e) => e.id === role.ebene);
            const subtitle = [role.gliederung, role.bundesland].filter(Boolean).join(' · ');
            return (
              <View
                key={`${role.ebene}-${role.rolle}-${i}`}
                style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
              >
                <Text style={styles.cardIcon}>{ebene?.icon || '📌'}</Text>
                <View style={styles.cardBody}>
                  <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
                    {role.rolle}
                  </Text>
                  {subtitle ? (
                    <Text
                      style={[styles.cardSubtitle, { color: theme.textSecondary }]}
                      numberOfLines={1}
                    >
                      {subtitle}
                    </Text>
                  ) : null}
                  {role.abgeordnete ? (
                    <Text
                      style={[styles.cardSubtitle, { color: theme.textSecondary }]}
                      numberOfLines={1}
                    >
                      {role.abgeordnete}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  onPress={() => handleDelete(i)}
                  hitSlop={8}
                  style={styles.deleteButton}
                  accessibilityLabel="Rolle entfernen"
                  accessibilityRole="button"
                >
                  <Ionicons name="trash-outline" size={18} color={colors.error[500]} />
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.medium,
    gap: spacing.small,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.small,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
  },
  addIconButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loader: {
    paddingVertical: spacing.large,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xsmall,
    borderWidth: 1,
    borderRadius: borderRadius.medium,
    borderCurve: 'continuous',
    paddingVertical: spacing.medium,
    marginTop: spacing.xsmall,
  },
  emptyButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  list: {
    gap: spacing.small,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: borderRadius.medium,
    borderCurve: 'continuous',
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.medium,
  },
  cardIcon: {
    fontSize: 20,
  },
  cardBody: {
    flex: 1,
    gap: 1,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  cardSubtitle: {
    fontSize: 12,
  },
  deleteButton: {
    padding: 4,
  },
});
