import { Ionicons } from '@expo/vector-icons';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';

import { colors, spacing, borderRadius } from '../../theme';

import type { ThinkingStep } from '../../services/chatStream';
import type { lightTheme, darkTheme } from '../../theme/colors';

const TOOL_LABELS: Record<string, string> = {
  search_documents: 'Suche in Dokumenten',
  web_search: 'Websuche',
  research: 'Recherche',
  search_examples: 'Beispiele suchen',
  generate_image: 'Bild generieren',
  edit_image: 'Bild bearbeiten',
};

interface Props {
  steps: ThinkingStep[];
  theme: typeof lightTheme | typeof darkTheme;
}

export function ThinkingStepIndicator({ steps, theme }: Props) {
  const activeSteps = steps.filter((s) => s.status === 'in_progress');
  if (activeSteps.length === 0) return null;

  const currentStep = activeSteps[activeSteps.length - 1];
  const label = TOOL_LABELS[currentStep.toolName] || currentStep.title;

  return (
    <View style={[styles.container, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <ActivityIndicator size="small" color={colors.primary[600]} />
      <Text style={[styles.text, { color: theme.textSecondary }]} numberOfLines={1}>
        {label}...
      </Text>
      <Ionicons name="sparkles" size={14} color={colors.primary[500]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    marginHorizontal: spacing.medium,
    marginBottom: spacing.small,
    borderRadius: borderRadius.large,
    borderWidth: 1,
  },
  text: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
});
