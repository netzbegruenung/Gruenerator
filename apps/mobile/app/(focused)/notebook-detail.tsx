import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NotebookChatPanel } from '../../components/notebook/NotebookChatPanel';
import { NotebookResearchPanel } from '../../components/notebook/NotebookResearchPanel';
import { MOBILE_SYSTEM_NOTEBOOKS } from '../../config/notebooksConfig';
import { colors, spacing, typography, borderRadius, lightTheme, darkTheme } from '../../theme';

type Tab = 'recherche' | 'chat';

export default function NotebookDetailScreen() {
  const { notebookId, title, kind } = useLocalSearchParams<{
    notebookId: string;
    title?: string;
    kind: 'system' | 'user';
  }>();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('recherche');

  const notebookKind: 'system' | 'user' = kind === 'user' ? 'user' : 'system';
  const icon: IoniconsIconName =
    MOBILE_SYSTEM_NOTEBOOKS.find((nb) => nb.id === notebookId)?.icon ?? 'book';
  const displayTitle = title || 'Notebook';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.cardBorder }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </Pressable>
        <Ionicons name={icon} size={20} color={colors.primary[600]} />
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          {displayTitle}
        </Text>
      </View>

      <View style={styles.segmentRow}>
        <Pressable
          onPress={() => setTab('recherche')}
          style={[
            styles.segment,
            {
              backgroundColor: tab === 'recherche' ? colors.primary[600] : theme.surface,
              borderColor: tab === 'recherche' ? colors.primary[600] : theme.border,
            },
          ]}
        >
          <Ionicons
            name="search-outline"
            size={16}
            color={tab === 'recherche' ? colors.white : theme.textSecondary}
          />
          <Text
            style={[styles.segmentText, { color: tab === 'recherche' ? colors.white : theme.text }]}
          >
            Recherche
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setTab('chat')}
          style={[
            styles.segment,
            {
              backgroundColor: tab === 'chat' ? colors.primary[600] : theme.surface,
              borderColor: tab === 'chat' ? colors.primary[600] : theme.border,
            },
          ]}
        >
          <Ionicons
            name="chatbubbles-outline"
            size={16}
            color={tab === 'chat' ? colors.white : theme.textSecondary}
          />
          <Text style={[styles.segmentText, { color: tab === 'chat' ? colors.white : theme.text }]}>
            Chat
          </Text>
        </Pressable>
      </View>

      {tab === 'recherche' ? (
        <NotebookResearchPanel notebookId={notebookId} kind={notebookKind} theme={theme} />
      ) : (
        <NotebookChatPanel notebookId={notebookId} kind={notebookKind} theme={theme} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.small,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    padding: 2,
  },
  title: {
    ...typography.bodyBold,
    fontSize: 17,
    flex: 1,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: spacing.xsmall,
    paddingHorizontal: spacing.medium,
    paddingTop: spacing.small,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xsmall,
    paddingVertical: spacing.small,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
