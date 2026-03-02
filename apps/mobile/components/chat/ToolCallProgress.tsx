import { Ionicons } from '@expo/vector-icons';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';

import { colors, spacing, borderRadius } from '../../theme';

import type { Theme } from '../../theme/colors';

const TOOL_LABELS: Record<string, string> = {
  gruenerator_search: 'Suche in Dokumenten',
  web_search: 'Websuche',
  research: 'Recherche',
  gruenerator_examples_search: 'Beispiele suchen',
  generate_image: 'Bild generieren',
  scrape_url: 'Webseite lesen',
  recall_memory: 'Erinnerung abrufen',
  save_memory: 'Erinnerung speichern',
  search_user_content: 'Inhalte durchsuchen',
};

interface ToolCallPartProps {
  part: {
    toolCallId: string;
    toolName: string;
    args: Record<string, unknown>;
    result?: unknown;
  };
  theme: Theme;
}

export function ToolCallProgress({ part, theme }: ToolCallPartProps) {
  const isComplete = part.result !== undefined;
  const label = TOOL_LABELS[part.toolName] || part.toolName;
  const query = typeof part.args?.query === 'string' ? part.args.query : null;

  return (
    <View style={[styles.container, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.header}>
        {isComplete ? (
          <Ionicons name="checkmark-circle" size={16} color={colors.primary[500]} />
        ) : (
          <ActivityIndicator size="small" color={colors.primary[600]} />
        )}
        <Text style={[styles.label, { color: theme.textSecondary }]} numberOfLines={1}>
          {label}
        </Text>
        <Ionicons name="sparkles" size={14} color={colors.primary[500]} />
      </View>
      {query && (
        <Text style={[styles.query, { color: theme.textSecondary }]} numberOfLines={1}>
          „{query}"
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.xsmall,
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xsmall,
    borderRadius: borderRadius.medium,
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
  },
  label: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  query: {
    fontSize: 12,
    marginTop: 2,
    marginLeft: spacing.medium + spacing.xsmall,
    fontStyle: 'italic',
  },
});
