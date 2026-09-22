import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet, useColorScheme } from 'react-native';

import { useNotebookLikes } from '../../hooks/notebook/useNotebookLikes';
import { usePublicNotebookCollections } from '../../hooks/notebook/usePublicNotebookCollections';
import {
  colors,
  spacing,
  typography,
  borderRadius,
  lightTheme,
  darkTheme,
  BODY_FONT,
} from '../../theme';

import { NotebookCoverArt } from './NotebookCoverArt';
import { NotebookTile, notebookTileGridStyle, useNotebookTileGrid } from './NotebookTile';

/**
 * „Öffentlich" — public community notebooks (web's BasisNotebooks). Same
 * tile as every other shelf, with drawn cover art (a community notebook has no
 * shipped webp) and the heart pinned in the corner, as on web. Gated on
 * `enabled` (auth) so the auth-required endpoints never query-storm for
 * signed-out users.
 */
export function CommunityNotebooksSection({
  enabled,
  onOpen,
}: {
  enabled: boolean;
  onOpen: (id: string, name: string) => void;
}) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const { size } = useNotebookTileGrid();
  const [query, setQuery] = useState('');
  const { publicNotebooks, isLoading } = usePublicNotebookCollections(enabled);
  const { isLiked, toggleLike } = useNotebookLikes(enabled);

  const filtered = useMemo(() => {
    if (!query) return publicNotebooks;
    const q = query.toLowerCase();
    return publicNotebooks.filter(
      (n) => n.name.toLowerCase().includes(q) || (n.description ?? '').toLowerCase().includes(q)
    );
  }, [query, publicNotebooks]);

  if (!enabled) return null;
  if (!isLoading && publicNotebooks.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>Öffentlich</Text>
      {publicNotebooks.length > 4 && (
        <View
          style={[styles.search, { backgroundColor: theme.surface, borderColor: theme.cardBorder }]}
        >
          <Ionicons name="search" size={16} color={theme.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Notebooks durchsuchen..."
            placeholderTextColor={theme.textSecondary}
            accessibilityLabel="Notebooks durchsuchen"
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
          />
        </View>
      )}
      {isLoading ? (
        <View style={notebookTileGridStyle}>
          {[0, 1, 2, 3].map((i) => (
            <View
              key={i}
              style={[
                styles.skeletonTile,
                { width: size, height: size, backgroundColor: theme.surface },
              ]}
            />
          ))}
        </View>
      ) : filtered.length === 0 ? (
        <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
          Keine Treffer für &ldquo;{query}&rdquo;
        </Text>
      ) : (
        <View style={notebookTileGridStyle}>
          {filtered.map((n) => {
            const liked = isLiked(n.id);
            const author = n.creator_name ? `von ${n.creator_name}` : undefined;
            return (
              <NotebookTile
                key={n.id}
                icon="people-outline"
                title={n.name}
                size={size}
                coverNode={
                  <NotebookCoverArt
                    title={n.name}
                    subtitle={author ?? n.description ?? undefined}
                    size={size}
                    reserveTopRight
                  />
                }
                onPress={() => onOpen(n.id, n.name)}
                overlay={
                  <Pressable
                    onPress={() => toggleLike(n.id)}
                    hitSlop={8}
                    style={styles.likeButton}
                    accessibilityRole="checkbox"
                    accessibilityLabel="Notebook favorisieren"
                    accessibilityState={{ checked: liked }}
                  >
                    <Ionicons
                      name={liked ? 'heart' : 'heart-outline'}
                      size={14}
                      color={colors.white}
                    />
                    <Text style={styles.likeCount}>{n.likes_count ?? 0}</Text>
                  </Pressable>
                }
              />
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.large,
  },
  sectionTitle: {
    fontFamily: 'Raleway_700Bold',
    fontSize: 17,
    marginBottom: spacing.small,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    paddingHorizontal: spacing.small,
    paddingVertical: 6,
    borderRadius: borderRadius.medium,
    borderWidth: 1,
    marginBottom: spacing.small,
  },
  searchInput: {
    flex: 1,
    fontFamily: BODY_FONT,
    fontSize: 14,
    paddingVertical: spacing.xxsmall,
  },
  skeletonTile: {
    borderRadius: borderRadius.large,
  },
  // Pinned on the cover art rather than on a card surface, so it carries its own
  // scrim — white-on-pink alone does not hold at 14px over the lighter stops.
  likeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: borderRadius.large,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  likeCount: {
    fontFamily: BODY_FONT,
    fontSize: 12,
    fontWeight: '500',
    color: colors.white,
  },
  emptyText: {
    ...typography.bodySmall,
    textAlign: 'center',
    paddingVertical: spacing.large,
  },
});
