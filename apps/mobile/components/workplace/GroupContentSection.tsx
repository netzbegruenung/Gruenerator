import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { useRouter } from 'expo-router';
import { memo, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, useColorScheme } from 'react-native';

import { useGroupContent, type GroupContentItem } from '../../hooks/useGroupContent';
import {
  colors,
  spacing,
  typography,
  borderRadius,
  lightTheme,
  darkTheme,
  type Theme,
  BODY_FONT,
} from '../../theme';
import { SkeletonBar, SkeletonGroup } from '../common/Skeleton';

interface GroupContentSectionProps {
  groupId: string;
}

interface SectionConfig {
  key: keyof Pick<
    ReturnType<typeof useGroupContent>['data'] & object,
    'docs' | 'boards' | 'generators' | 'notebooks' | 'agents' | 'texts' | 'templates' | 'documents'
  >;
  label: string;
  icon: IoniconsIconName;
}

const SECTIONS: SectionConfig[] = [
  { key: 'docs', label: 'Dokumente', icon: 'document-text-outline' },
  { key: 'boards', label: 'Boards', icon: 'grid-outline' },
  { key: 'generators', label: 'Grüneratoren', icon: 'sparkles-outline' },
  { key: 'notebooks', label: 'Notizbücher', icon: 'book-outline' },
  { key: 'agents', label: 'Agent*innen', icon: 'chatbubbles-outline' },
  { key: 'texts', label: 'Texte', icon: 'reader-outline' },
  { key: 'templates', label: 'Vorlagen', icon: 'albums-outline' },
  { key: 'documents', label: 'Dateien', icon: 'folder-outline' },
];

export const GroupContentSection = memo(function GroupContentSection({
  groupId,
}: GroupContentSectionProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const router = useRouter();
  const { data, isPending, isError, refetch } = useGroupContent(groupId);

  const openItem = useCallback(
    (item: GroupContentItem) => {
      switch (item.kind) {
        case 'doc':
          router.push({ pathname: '/(fullscreen)/doc-editor', params: { id: item.id } });
          return;
        case 'board':
          router.push({
            pathname: '/(fullscreen)/web-viewer',
            params: { path: `/boards/${item.id}`, title: item.title },
          });
          return;
        case 'generator': {
          const slugOrId = item.slug ?? item.id;
          router.push({
            pathname: '/(fullscreen)/web-viewer',
            params: {
              path: `/gruenerator/${slugOrId}`,
              title: item.title,
            },
          });
          return;
        }
        case 'notebook':
          // `/notebooks/`, not the singular `/notebook/`: the latter is a
          // legacy route that immediately redirects to this one client-side.
          // The WebView pins its policy to the path it was opened with, so
          // after the redirect the URL no longer matches that prefix — a full
          // reload of the page we are showing would be blocked by our own gate.
          router.push({
            pathname: '/(fullscreen)/web-viewer',
            params: { path: `/notebooks/${item.id}`, title: item.title },
          });
          return;
        case 'agent':
          // Open a native chat with the shared agent (item.id is the agent
          // identifier). Resolution for non-owner members is handled by the
          // group-share fallback in getAgentForUser.
          router.push({
            pathname: '/(focused)/chat-conversation',
            params: { threadId: 'new', agentId: item.id },
          });
          return;
        case 'text':
          router.push({
            pathname: '/(fullscreen)/web-viewer',
            params: { path: `/texte/${item.id}`, title: item.title },
          });
          return;
        case 'template':
          router.push({
            pathname: '/(fullscreen)/web-viewer',
            params: {
              path: `/datenbank/vorlagen?selected=${item.id}`,
              title: item.title,
            },
          });
          return;
        case 'document':
          router.push({
            pathname: '/(fullscreen)/web-viewer',
            params: { path: `/documents/${item.id}`, title: item.title },
          });
          return;
      }
    },
    [router]
  );

  if (isPending) {
    // Three rows in the shape `ContentRow` draws — the same bordered card, the
    // same 38-dp icon well. Which sections will have items is not known yet, so
    // the skeleton stays under the one heading that is always there.
    return (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Inhalte</Text>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={[styles.row, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
          >
            <SkeletonGroup on="card" style={styles.skeletonRow}>
              <SkeletonBar width={38} height={38} radius={borderRadius.medium} />
              <View style={styles.skeletonText}>
                <SkeletonBar width={(['68%', '52%', '76%'] as const)[i]} height={14} />
                <SkeletonBar width="30%" height={11} />
              </View>
            </SkeletonGroup>
          </View>
        ))}
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Inhalte</Text>
        <Pressable
          onPress={() => void refetch()}
          style={styles.errorRow}
          accessibilityRole="button"
        >
          <Ionicons name="alert-circle-outline" size={18} color={colors.semantic.error} />
          <Text style={[styles.errorText, { color: colors.semantic.error }]}>
            Inhalte konnten nicht geladen werden. Erneut versuchen.
          </Text>
        </Pressable>
      </View>
    );
  }

  if (!data || data.totalCount === 0) {
    return (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Inhalte</Text>
        <View style={[styles.emptyRow, { borderColor: theme.cardBorder }]}>
          <Ionicons name="folder-open-outline" size={22} color={theme.textSecondary} />
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            Noch keine Inhalte geteilt. Teile Dokumente, Boards oder Notizbücher auf dem Web.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {SECTIONS.map((section) => {
        const items = data[section.key];
        if (items.length === 0) return null;
        return (
          <View key={section.key} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
              {section.label} · {items.length}
            </Text>
            {items.map((item) => (
              <ContentRow
                key={`${section.key}-${item.id}`}
                item={item}
                icon={section.icon}
                theme={theme}
                onPress={() => openItem(item)}
              />
            ))}
          </View>
        );
      })}
    </View>
  );
});

function ContentRow({
  item,
  icon,
  theme,
  onPress,
}: {
  item: GroupContentItem;
  icon: IoniconsIconName;
  theme: Theme;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed ? theme.surface : theme.card,
          borderColor: theme.cardBorder,
        },
      ]}
      accessibilityRole="button"
    >
      <View style={[styles.iconWrapper, { backgroundColor: colors.primary[600] + '18' }]}>
        <Ionicons name={icon} size={20} color={colors.primary[600]} />
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>
          {item.title}
        </Text>
        {item.subtitle || item.sharedByName ? (
          <Text style={[styles.rowSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>
            {[item.subtitle, item.sharedByName ? `geteilt von ${item.sharedByName}` : null]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.large },
  section: { gap: spacing.xsmall },
  sectionTitle: {
    fontFamily: BODY_FONT,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: spacing.xsmall,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.medium,
    borderRadius: borderRadius.medium,
    borderWidth: 1,
    padding: spacing.medium,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.medium,
    flex: 1,
  },
  skeletonText: { flex: 1, gap: 4 },
  iconWrapper: {
    width: 38,
    height: 38,
    borderRadius: borderRadius.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { ...typography.body, fontWeight: '600' },
  rowSubtitle: { fontFamily: BODY_FONT, fontSize: 12 },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    paddingVertical: spacing.small,
  },
  errorText: { ...typography.bodySmall, flex: 1 },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    padding: spacing.medium,
    borderRadius: borderRadius.medium,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  emptyText: { ...typography.bodySmall, flex: 1 },
});
