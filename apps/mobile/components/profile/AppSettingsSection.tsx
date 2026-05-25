import { router } from 'expo-router';
import { StyleSheet, Text, View, Pressable, useColorScheme } from 'react-native';

import { usePreferencesStore, type ThemeMode } from '../../stores/preferencesStore';
import { lightTheme, darkTheme, spacing, colors, borderRadius } from '../../theme';

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'Automatisch' },
  { value: 'light', label: 'Hell' },
  { value: 'dark', label: 'Dunkel' },
];

export function AppSettingsSection() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const setThemeMode = usePreferencesStore((s) => s.setThemeMode);

  return (
    <View style={styles.container}>
      <View style={styles.headerText}>
        <Text style={[styles.title, { color: theme.text }]}>App-Einstellungen</Text>
        <Text style={[styles.description, { color: theme.textSecondary }]}>
          Passe an, wie der Grünerator für dich aussieht.
        </Text>
      </View>

      <View style={styles.row}>
        <Text style={[styles.rowLabel, { color: theme.text }]}>Erscheinungsbild</Text>
        <View style={[styles.switch, { borderColor: theme.border }]}>
          {THEME_OPTIONS.map((opt) => {
            const active = themeMode === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => void setThemeMode(opt.value)}
                style={[
                  styles.option,
                  { backgroundColor: active ? colors.primary[600] : 'transparent' },
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    { color: active ? colors.white : theme.textSecondary },
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.row}>
        <Text style={[styles.rowLabel, { color: theme.text }]}>Einführung</Text>
        <Pressable
          onPress={() => router.push('/(auth)/onboarding')}
          style={[styles.replayButton, { backgroundColor: colors.secondary[600] }]}
        >
          <Text style={styles.replayText}>Erneut ansehen</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.medium,
    gap: spacing.small,
  },
  headerText: {
    gap: spacing.xxsmall,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
  },
  row: {
    gap: spacing.xsmall,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  switch: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: borderRadius.pill,
    borderCurve: 'continuous',
    padding: 2,
    alignSelf: 'flex-start',
  },
  option: {
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.xsmall,
    borderRadius: borderRadius.pill,
    borderCurve: 'continuous',
  },
  optionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  replayButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.xsmall,
    borderRadius: borderRadius.pill,
    borderCurve: 'continuous',
  },
  replayText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.white,
  },
});
