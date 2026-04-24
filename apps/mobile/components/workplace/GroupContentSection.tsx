import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { memo, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, useColorScheme } from 'react-native';

import { useGroupContent, type GroupContentItem } from '../../hooks/useGroupContent';
import {
  colors,
  spacing,
  typography,
  borderRadius,
  lightTheme,
  darkTheme,
  type Theme,
} from '../../theme';

interface GroupContentSectionProps {
  groupId: string;
}

interface SectionConfig {
  key: keyof Pick<
    ReturnType<typeof useGroupContent>['data'] & object,
    'docs' | 'boards' | 'generators' | 'notebooks' | 'texts' | 'templates' | 'documents'
  >;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const SECTIONS: SectionConfig[] = [
  { key: 'docs', label: 'Dokumente', icon: 'document-text-outline' },
  { key: 'boards', label: 'Boards', icon: 'grid-outline' },
  { key: 'generators', label: 'Grüneratoren', icon: 'sparkles-outline' },
  { key: 'notebooks', label: 'Notizbücher', icon: 'book-outline' },
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
          router.push({ pathname: '/(fullscreen)/board-viewer', params: { id: item.id } });
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
          router.push({
            pathname: '/(fullscreen)/web-viewer',
            params: { path: `/notebook/${item.id}`, title: item.title },
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
    return (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Inhalte</Text>
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.primary[600]} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            Geteilte Inhalte werden geladen…
          </Text>
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Inhalte</Text>
        <Pressable onPress={() => void refetch()} style={styles.errorRow}>
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
  icon: keyof typeof Ionicons.glyphMap;
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
  iconWrapper: {
    width: 38,
    height: 38,
    borderRadius: borderRadius.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { ...typography.body, fontWeight: '600' },
  rowSubtitle: { fontSize: 12 },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    paddingVertical: spacing.medium,
    paddingHorizontal: spacing.xsmall,
  },
  loadingText: { ...typography.bodySmall },
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
