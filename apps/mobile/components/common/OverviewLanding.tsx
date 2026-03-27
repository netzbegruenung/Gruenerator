import { memo } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, useColorScheme } from 'react-native';

import { colors, spacing, borderRadius, lightTheme, darkTheme } from '../../theme';

import { ComposerCard } from './ComposerCard';

import type { Theme } from '../../theme/colors';

interface ExamplePrompt {
  label: string;
  text: string;
}

interface OverviewLandingProps {
  title: string;
  subtitle?: string;
  placeholder?: string;
  examples: ExamplePrompt[];
  onSend: (text: string) => void;
}

export const OverviewLanding = memo(function OverviewLanding({
  title,
  subtitle,
  placeholder,
  examples,
  onSend,
}: OverviewLandingProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        {subtitle && (
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{subtitle}</Text>
        )}
      </View>

      <ComposerCard placeholder={placeholder} onSend={onSend} />

      <View style={styles.promptsRow}>
        {examples.map((p) => (
          <Pressable
            key={p.label}
            onPress={() => onSend(p.text)}
            style={({ pressed }) => [
              styles.chip,
              { borderColor: theme.border, opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Text style={[styles.chipLabel, { color: theme.textSecondary }]}>{p.label}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.medium,
    paddingBottom: spacing.xlarge,
  },
  header: {
    marginBottom: spacing.large,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 26,
    fontWeight: '700',
    marginTop: 2,
  },
  promptsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xsmall,
    marginTop: spacing.medium,
  },
  chip: {
    paddingHorizontal: spacing.small,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  chipLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
});
