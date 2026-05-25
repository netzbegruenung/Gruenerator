import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  useColorScheme,
} from 'react-native';

import { useNotebookLikes } from '../../hooks/notebook/useNotebookLikes';
import { usePublicNotebookCollections } from '../../hooks/notebook/usePublicNotebookCollections';
import { colors, spacing, typography, borderRadius, lightTheme, darkTheme } from '../../theme';

import { NotebookCard } from './NotebookCard';

/**
 * "Von der Basis" — public community notebooks (web's VonDerBasisSection). Reuses
 * NotebookCard with a heart in the trailing slot. Gated on `enabled` (auth) so the
 * auth-required endpoints never query-storm for signed-out users.
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
      <Text style={[styles.sectionTitle, { color: theme.text }]}>Von der Basis</Text>
      {publicNotebooks.length > 4 && (
        <View
          style={[styles.search, { backgroundColor: theme.surface, borderColor: theme.cardBorder }]}
        >
          <Ionicons name="search" size={16} color={theme.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Notebooks durchsuchen..."
            placeholderTextColor={theme.textSecondary}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
          />
        </View>
      )}
      {isLoading ? (
        <ActivityIndicator color={colors.primary[600]} style={styles.loading} />
      ) : filtered.length === 0 ? (
        <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
          Keine Treffer für &ldquo;{query}&rdquo;
        </Text>
      ) : (
        filtered.map((n) => {
          const liked = isLiked(n.id);
          return (
            <NotebookCard
              key={n.id}
              icon="people-outline"
              title={n.name}
              subtitle={n.creator_name ? `von ${n.creator_name}` : undefined}
              onPress={() => onOpen(n.id, n.name)}
              trailing={
                <Pressable onPress={() => toggleLike(n.id)} hitSlop={8} style={styles.likeButton}>
                  <Ionicons
                    name={liked ? 'heart' : 'heart-outline'}
                    size={16}
                    color={liked ? colors.primary[600] : theme.textSecondary}
                  />
                  <Text style={[styles.likeCount, { color: theme.textSecondary }]}>
                    {n.likes_count ?? 0}
                  </Text>
                </Pressable>
              }
            />
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.large,
  },
  sectionTitle: {
    ...typography.bodyBold,
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
    fontSize: 14,
    paddingVertical: spacing.xxsmall,
  },
  likeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  likeCount: {
    fontSize: 12,
    fontWeight: '500',
  },
  loading: {
    paddingVertical: spacing.large,
  },
  emptyText: {
    ...typography.bodySmall,
    textAlign: 'center',
    paddingVertical: spacing.large,
  },
});
