import { Ionicons } from '@react-native-vector-icons/ionicons';
import { View, Text, Pressable, StyleSheet } from 'react-native';

import { useNotebookDiscovery } from '../../hooks/notebook/useNotebookDiscovery';
import { colors, spacing, typography, borderRadius } from '../../theme';

import type { Theme } from '../../theme/colors';

interface Props {
  locale: 'de-DE' | 'de-AT';
  theme: Theme;
  onOpen: (id: string, name: string) => void;
}

export function VonDerBasisSection({ locale, theme, onOpen }: Props) {
  const { collections, isLoading, likedIds, toggleLike } = useNotebookDiscovery(locale);

  if (isLoading || collections.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>Von der Basis</Text>
      {collections.map((c) => {
        const liked = likedIds.has(c.id);
        return (
          <Pressable
            key={c.id}
            onPress={() => onOpen(c.id, c.name)}
            style={({ pressed }) => [
              styles.card,
              {
                backgroundColor: pressed ? theme.surface : theme.card,
                borderColor: theme.cardBorder,
              },
            ]}
          >
            <View style={styles.cardBody}>
              <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
                {c.name}
              </Text>
              {c.description && (
                <Text
                  style={[styles.cardDescription, { color: theme.textSecondary }]}
                  numberOfLines={2}
                >
                  {c.description}
                </Text>
              )}
              {c.creator_name && (
                <Text
                  style={[styles.cardCreator, { color: theme.textSecondary }]}
                  numberOfLines={1}
                >
                  von {c.creator_name}
                </Text>
              )}
            </View>
            <Pressable
              onPress={() => toggleLike(c.id)}
              hitSlop={8}
              style={styles.likeButton}
              accessibilityLabel={liked ? 'Like entfernen' : 'Liken'}
            >
              <Ionicons
                name={liked ? 'heart' : 'heart-outline'}
                size={20}
                color={liked ? colors.error[500] : theme.textSecondary}
              />
              {c.likes_count > 0 && (
                <Text style={[styles.likeCount, { color: theme.textSecondary }]}>
                  {c.likes_count}
                </Text>
              )}
            </Pressable>
          </Pressable>
        );
      })}
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
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.small,
    borderRadius: borderRadius.medium,
    borderWidth: 1,
    marginBottom: spacing.xsmall,
  },
  cardBody: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    ...typography.body,
    fontSize: 14,
    fontWeight: '600',
  },
  cardDescription: {
    fontSize: 12,
  },
  cardCreator: {
    fontSize: 11,
  },
  likeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.xsmall,
  },
  likeCount: {
    fontSize: 12,
    fontWeight: '500',
  },
});
