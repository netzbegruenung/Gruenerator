import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, useColorScheme, Pressable } from 'react-native';

import { NotebookChat } from '../../../components/notebooks';
import { NOTEBOOK_LIST, type NotebookConfig } from '../../../config/notebooksConfig';
import { colors, spacing, typography, borderRadius, lightTheme, darkTheme } from '../../../theme';

const ICON_MAP: Record<NotebookConfig['icon'], keyof typeof Ionicons.glyphMap> = {
  library: 'library',
  'document-text': 'document-text',
  globe: 'globe',
  flag: 'flag',
};

function NotebookCard({ notebook, onPress }: { notebook: NotebookConfig; onPress: () => void }) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const collectionSummary =
    notebook.collections.length === 1
      ? notebook.collections[0].description
      : `${notebook.collections.length} Quellen`;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: pressed ? theme.surface : theme.card,
          borderColor: theme.cardBorder,
        },
      ]}
    >
      <View style={[styles.cardIcon, { backgroundColor: notebook.color + '15' }]}>
        <Ionicons name={ICON_MAP[notebook.icon]} size={28} color={notebook.color} />
      </View>

      <View style={styles.cardContent}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>{notebook.title}</Text>
        <Text style={[styles.cardDescription, { color: theme.textSecondary }]} numberOfLines={2}>
          {collectionSummary}
        </Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsContainer}
          contentContainerStyle={styles.chipsContent}
        >
          {notebook.exampleQuestions.slice(0, 2).map((q, i) => (
            <View key={i} style={[styles.chip, { backgroundColor: theme.surface }]}>
              <Text style={[styles.chipText, { color: theme.textSecondary }]} numberOfLines={1}>
                {q.icon} {q.text}
              </Text>
            </View>
          ))}
        </ScrollView>
      </View>

      <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
    </Pressable>
  );
}

export default function NotebooksScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const [selectedNotebook, setSelectedNotebook] = useState<string | null>(null);

  if (selectedNotebook) {
    return (
      <View style={[styles.chatContainer, { backgroundColor: theme.background }]}>
        <Pressable
          onPress={() => setSelectedNotebook(null)}
          style={[styles.backButton, { borderBottomColor: theme.border }]}
        >
          <Ionicons name="arrow-back" size={20} color={colors.primary[600]} />
          <Text style={[styles.backText, { color: colors.primary[600] }]}>Notebooks</Text>
        </Pressable>
        <NotebookChat notebookId={selectedNotebook} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.scrollContent}
    >
      <View style={styles.header}>
        <Ionicons name="library" size={32} color={colors.primary[600]} />
        <Text style={[styles.title, { color: theme.text }]}>Notebooks</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Durchsuche Parteiprogramme, Fraktionsinhalte und mehr
        </Text>
      </View>

      <View style={styles.cardList}>
        {NOTEBOOK_LIST.map((notebook) => (
          <NotebookCard
            key={notebook.id}
            notebook={notebook}
            onPress={() => setSelectedNotebook(notebook.id)}
          />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.medium,
    paddingBottom: spacing.xxlarge,
  },
  header: {
    alignItems: 'center',
    gap: spacing.xsmall,
    marginBottom: spacing.large,
    paddingTop: spacing.medium,
  },
  title: {
    ...typography.h2,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.bodySmall,
    textAlign: 'center',
    maxWidth: 280,
  },
  cardList: {
    gap: spacing.small,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.medium,
    borderRadius: borderRadius.large,
    borderWidth: 1,
    gap: spacing.medium,
  },
  cardIcon: {
    width: 52,
    height: 52,
    borderRadius: borderRadius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    flex: 1,
    gap: spacing.xxsmall,
  },
  cardTitle: {
    ...typography.bodyBold,
  },
  cardDescription: {
    ...typography.caption,
  },
  chipsContainer: {
    marginTop: spacing.xxsmall,
  },
  chipsContent: {
    gap: spacing.xsmall,
  },
  chip: {
    paddingHorizontal: spacing.xsmall,
    paddingVertical: spacing.xxsmall,
    borderRadius: borderRadius.pill,
    maxWidth: 200,
  },
  chipText: {
    fontSize: 11,
  },
  chatContainer: {
    flex: 1,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    borderBottomWidth: 1,
  },
  backText: {
    ...typography.label,
  },
});
