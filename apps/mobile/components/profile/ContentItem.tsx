import { StyleSheet, Text, View, Pressable, useColorScheme, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { lightTheme, darkTheme, typography, spacing, colors, borderRadius } from '../../theme';
import type { CombinedContentItem } from '../../services/content';

interface ContentItemProps {
  item: CombinedContentItem;
  onDelete: (id: string, itemType: 'document' | 'text') => void;
  onPress?: (item: CombinedContentItem) => void;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function getTypeLabel(type: string | undefined, itemType: 'document' | 'text'): string {
  if (itemType === 'text') {
    if (!type) return 'Text';
    const typeMap: Record<string, string> = {
      antrag: 'Antrag',
      presse: 'Presse',
      social: 'Social Media',
      rede: 'Rede',
      universal: 'Text',
    };
    return typeMap[type] || 'Text';
  }
  return 'Dokument';
}

export function ContentItem({ item, onDelete, onPress }: ContentItemProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const handleLongPress = () => {
    Alert.alert(
      'Löschen bestätigen',
      `Möchtest du "${item.title || 'Ohne Titel'}" wirklich löschen?`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: () => onDelete(item.id, item.itemType),
        },
      ]
    );
  };

  const handlePress = () => {
    if (onPress) {
      onPress(item);
    }
  };

  const isText = item.itemType === 'text';
  const iconName = isText ? 'document-text-outline' : 'folder-outline';

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        { backgroundColor: theme.card, borderColor: theme.border },
        pressed && styles.pressed,
      ]}
      onPress={handlePress}
      onLongPress={handleLongPress}
      delayLongPress={500}
    >
      <View
        style={[
          styles.iconContainer,
          { backgroundColor: isText ? colors.primary[100] : colors.secondary[100] },
        ]}
      >
        <Ionicons
          name={iconName}
          size={24}
          color={isText ? colors.primary[600] : colors.secondary[600]}
        />
      </View>

      <View style={styles.content}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
          {item.title || 'Ohne Titel'}
        </Text>

        <View style={styles.metaRow}>
          <View
            style={[
              styles.typeBadge,
              { backgroundColor: isText ? colors.primary[50] : colors.secondary[50] },
            ]}
          >
            <Text
              style={[
                styles.typeText,
                { color: isText ? colors.primary[700] : colors.secondary[700] },
              ]}
            >
              {getTypeLabel(item.type, item.itemType)}
            </Text>
          </View>

          <Text style={[styles.date, { color: theme.textSecondary }]}>
            {item.updated_at ? formatDate(item.updated_at) : ''}
          </Text>

          {item.word_count && item.word_count > 0 && (
            <Text style={[styles.wordCount, { color: theme.textSecondary }]}>
              {item.word_count} Wörter
            </Text>
          )}
        </View>
      </View>

      <Ionicons
        name="chevron-forward"
        size={20}
        color={theme.textSecondary}
        style={styles.chevron}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.medium,
    marginHorizontal: spacing.medium,
    marginVertical: spacing.xsmall,
    borderRadius: borderRadius.medium,
    borderWidth: 1,
  },
  pressed: {
    opacity: 0.7,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.medium,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.medium,
  },
  content: {
    flex: 1,
  },
  title: {
    ...typography.bodyBold,
    marginBottom: spacing.xsmall,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.small,
  },
  typeBadge: {
    paddingHorizontal: spacing.small,
    paddingVertical: 2,
    borderRadius: borderRadius.small,
  },
  typeText: {
    ...typography.caption,
    fontWeight: '500',
  },
  date: {
    ...typography.caption,
  },
  wordCount: {
    ...typography.caption,
  },
  chevron: {
    marginLeft: spacing.small,
  },
});
