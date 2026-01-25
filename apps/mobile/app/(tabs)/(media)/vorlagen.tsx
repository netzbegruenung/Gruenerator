import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  Pressable,
  ActivityIndicator,
  useColorScheme,
  RefreshControl,
  Dimensions,
  Linking,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, lightTheme, darkTheme, typography } from '../../../theme';
import {
  fetchVorlagen,
  fetchVorlagenCategories,
  fetchTemplateLikes,
  likeTemplate,
  unlikeTemplate,
  type Template,
  type TemplateCategory,
} from '../../../services/vorlagen';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const NUM_COLUMNS = 2;
const ITEM_GAP = spacing.small;
const ITEM_SIZE = (SCREEN_WIDTH - spacing.medium * 2 - ITEM_GAP) / NUM_COLUMNS;

export default function VorlagenScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const [templates, setTemplates] = useState<Template[]>([]);
  const [categories, setCategories] = useState<TemplateCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [likedTemplates, setLikedTemplates] = useState<Set<string>>(new Set());

  const loadData = useCallback(async (templateType?: string | null) => {
    const [templatesData, categoriesData, likesData] = await Promise.all([
      fetchVorlagen(templateType ? { templateType } : undefined),
      fetchVorlagenCategories(),
      fetchTemplateLikes(),
    ]);
    setTemplates(templatesData);
    setCategories(categoriesData);
    setLikedTemplates(new Set(likesData));
  }, []);

  const handleLikeToggle = useCallback(
    async (templateId: string) => {
      const isCurrentlyLiked = likedTemplates.has(templateId);

      // Optimistic update
      setLikedTemplates((prev) => {
        const next = new Set(prev);
        if (isCurrentlyLiked) {
          next.delete(templateId);
        } else {
          next.add(templateId);
        }
        return next;
      });

      // Make API call
      const success = isCurrentlyLiked
        ? await unlikeTemplate(templateId)
        : await likeTemplate(templateId, 'system');

      // Revert on failure
      if (!success) {
        setLikedTemplates((prev) => {
          const next = new Set(prev);
          if (isCurrentlyLiked) {
            next.add(templateId);
          } else {
            next.delete(templateId);
          }
          return next;
        });
      }
    },
    [likedTemplates]
  );

  useEffect(() => {
    setIsLoading(true);
    loadData(selectedCategory).finally(() => setIsLoading(false));
  }, [loadData, selectedCategory]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData(selectedCategory);
    setRefreshing(false);
  }, [loadData, selectedCategory]);

  const handleTemplatePress = useCallback(async (template: Template) => {
    const url = template.external_url || template.canvaUrl;
    if (!url) {
      Alert.alert('Keine URL', 'Diese Vorlage hat keine verknüpfte URL.');
      return;
    }

    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Fehler', 'Die URL konnte nicht geöffnet werden.');
      }
    } catch (error) {
      console.error('[Vorlagen] Failed to open URL:', error);
      Alert.alert('Fehler', 'Die URL konnte nicht geöffnet werden.');
    }
  }, []);

  const handleCategoryPress = useCallback((categoryId: string | null) => {
    setSelectedCategory(categoryId);
  }, []);

  const filteredTemplates = useMemo(() => {
    if (!selectedCategory) return templates;
    return templates;
  }, [templates, selectedCategory]);

  const renderCategoryChip = useCallback(
    ({ item }: { item: TemplateCategory | { id: null; label: string } }) => {
      const isSelected = selectedCategory === item.id;
      return (
        <Pressable
          style={[styles.categoryChip, isSelected && styles.categoryChipActive]}
          onPress={() => handleCategoryPress(item.id)}
        >
          <Text style={[styles.categoryChipText, isSelected && styles.categoryChipTextActive]}>
            {item.label}
          </Text>
        </Pressable>
      );
    },
    [selectedCategory, handleCategoryPress]
  );

  const renderItem = useCallback(
    ({ item }: { item: Template }) => {
      const imageUrl = item.thumbnail_url || item.images?.[0]?.url;
      const isLiked = likedTemplates.has(item.id);

      return (
        <View style={styles.itemContainer}>
          <Pressable
            style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
            onPress={() => handleTemplatePress(item)}
          >
            {imageUrl ? (
              <Image source={{ uri: imageUrl }} style={styles.itemImage} resizeMode="cover" />
            ) : (
              <View style={[styles.itemImage, styles.itemImagePlaceholder]}>
                <Ionicons name="image-outline" size={32} color={colors.grey[400]} />
              </View>
            )}
            <Pressable
              style={styles.likeButton}
              onPress={() => handleLikeToggle(item.id)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons
                name={isLiked ? 'heart' : 'heart-outline'}
                size={22}
                color={isLiked ? colors.primary[600] : colors.grey[400]}
              />
            </Pressable>
            <View style={styles.itemOverlay}>
              <Text style={styles.itemTitle} numberOfLines={2}>
                {item.title}
              </Text>
              {item.template_type && (
                <View style={styles.typeBadge}>
                  <Text style={styles.typeBadgeText}>{item.template_type}</Text>
                </View>
              )}
            </View>
          </Pressable>
          {item.tags && item.tags.length > 0 && (
            <View style={styles.tagsContainer}>
              {item.tags.slice(0, 3).map((tag, index) => (
                <Text key={index} style={[styles.tag, { color: theme.textSecondary }]}>
                  #{tag}
                </Text>
              ))}
            </View>
          )}
        </View>
      );
    },
    [handleTemplatePress, handleLikeToggle, likedTemplates, theme.textSecondary]
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="document-outline" size={64} color={theme.textSecondary} />
      <Text style={[styles.emptyTitle, { color: theme.text }]}>Keine Vorlagen gefunden</Text>
      <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
        {selectedCategory
          ? 'In dieser Kategorie sind keine Vorlagen verfügbar.'
          : 'Es sind noch keine Vorlagen verfügbar.'}
      </Text>
    </View>
  );

  const categoryData = useMemo(
    () => [{ id: null, label: 'Alle' } as const, ...categories],
    [categories]
  );

  if (isLoading && templates.length === 0) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary[600]} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Lade Vorlagen...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {categories.length > 0 && (
        <FlatList
          horizontal
          data={categoryData}
          renderItem={renderCategoryChip}
          keyExtractor={(item) => item.id || 'all'}
          contentContainerStyle={styles.categoryList}
          showsHorizontalScrollIndicator={false}
          style={styles.categoryListContainer}
        />
      )}

      <FlatList
        data={filteredTemplates}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        numColumns={NUM_COLUMNS}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={styles.columnWrapper}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary[600]}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryListContainer: {
    flexGrow: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.grey[200],
  },
  categoryList: {
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    gap: spacing.small,
  },
  categoryChip: {
    paddingVertical: spacing.xsmall,
    paddingHorizontal: spacing.medium,
    borderRadius: borderRadius.full,
    backgroundColor: colors.grey[100],
    marginRight: spacing.small,
  },
  categoryChipActive: {
    backgroundColor: colors.primary[600],
  },
  categoryChipText: {
    ...typography.caption,
    color: colors.grey[600],
  },
  categoryChipTextActive: {
    color: colors.white,
    fontWeight: '600',
  },
  listContent: {
    padding: spacing.medium,
    paddingBottom: spacing.xxlarge,
  },
  columnWrapper: {
    gap: ITEM_GAP,
    marginBottom: ITEM_GAP,
  },
  itemContainer: {
    width: ITEM_SIZE,
  },
  item: {
    borderRadius: borderRadius.medium,
    overflow: 'hidden',
    backgroundColor: colors.grey[100],
  },
  itemPressed: {
    opacity: 0.8,
  },
  itemImage: {
    width: ITEM_SIZE,
    height: ITEM_SIZE * 0.75,
  },
  itemImagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.grey[200],
  },
  likeButton: {
    position: 'absolute',
    top: spacing.xsmall,
    right: spacing.xsmall,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  itemOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: spacing.xsmall,
  },
  itemTitle: {
    ...typography.caption,
    color: colors.white,
    fontWeight: '600',
  },
  typeBadge: {
    marginTop: spacing.xxsmall,
    alignSelf: 'flex-start',
    paddingVertical: 2,
    paddingHorizontal: spacing.xsmall,
    backgroundColor: colors.primary[600],
    borderRadius: borderRadius.small,
  },
  typeBadgeText: {
    ...typography.caption,
    fontSize: 10,
    color: colors.white,
    fontWeight: '600',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xxsmall,
    paddingVertical: spacing.xsmall,
    paddingHorizontal: spacing.xxsmall,
  },
  tag: {
    ...typography.caption,
    fontSize: 10,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: spacing.xxlarge * 2,
  },
  emptyTitle: {
    ...typography.h4,
    marginTop: spacing.medium,
  },
  emptyText: {
    ...typography.body,
    textAlign: 'center',
    marginTop: spacing.xsmall,
    paddingHorizontal: spacing.xlarge,
  },
  loadingText: {
    ...typography.body,
    marginTop: spacing.medium,
  },
});
