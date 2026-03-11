import { Ionicons } from '@expo/vector-icons';
import { getGlobalApiClient } from '@gruenerator/shared/api';
import { STOCK_CATEGORY_LABELS, fetchStockImages } from '@gruenerator/shared/image-studio';
import { Image } from 'expo-image';
import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ScrollView,
  ActivityIndicator,
  useColorScheme,
  Dimensions,
  Alert,
} from 'react-native';

import { fetchStockImageForMobile } from '../../services/imageSourceService';
import { colors, spacing, borderRadius, lightTheme, darkTheme, typography } from '../../theme';

import { UnsplashAttribution } from './UnsplashAttribution';

import type { StockImage } from '@gruenerator/shared/image-studio';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const NUM_COLUMNS = 3;
const ITEM_GAP = spacing.xsmall;
const ITEM_SIZE = (SCREEN_WIDTH - spacing.medium * 2 - ITEM_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

interface StockImagesGridProps {
  onImageSelected: (uri: string, base64: string) => void;
}

export function StockImagesGrid({ onImageSelected }: StockImagesGridProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const isDark = colorScheme === 'dark';

  const [images, setImages] = useState<StockImage[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingImage, setLoadingImage] = useState<string | null>(null);

  const loadImages = useCallback(async (category?: string) => {
    setIsLoading(true);
    try {
      const client = getGlobalApiClient();
      const result = await fetchStockImages(client, category === 'all' ? null : category);
      setImages(result.images);
      if (result.categories.length > 0) {
        setCategories(result.categories);
      }
    } catch (error) {
      console.error('[StockImagesGrid] Failed to load:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadImages(selectedCategory);
  }, [selectedCategory, loadImages]);

  const handleCategoryChange = useCallback((category: string) => {
    setSelectedCategory(category);
  }, []);

  const handleImagePress = useCallback(
    async (image: StockImage) => {
      setLoadingImage(image.filename);
      try {
        const result = await fetchStockImageForMobile(image);
        onImageSelected(result.uri, result.base64);
      } catch (error) {
        Alert.alert('Fehler', 'Das Bild konnte nicht geladen werden.');
      } finally {
        setLoadingImage(null);
      }
    },
    [onImageSelected]
  );

  const allCategories = ['all', ...categories.filter((c) => c !== 'all')];

  const renderCategoryPill = (category: string) => {
    const isActive = selectedCategory === category;
    const label = STOCK_CATEGORY_LABELS[category] || category;

    return (
      <Pressable
        key={category}
        onPress={() => handleCategoryChange(category)}
        style={[
          styles.categoryPill,
          isActive
            ? styles.categoryPillActive
            : {
                borderColor: isDark ? colors.grey[700] : colors.grey[300],
                backgroundColor: isDark ? colors.grey[900] : colors.white,
              },
        ]}
      >
        <Text style={[styles.categoryLabel, { color: isActive ? colors.white : theme.text }]}>
          {label}
        </Text>
      </Pressable>
    );
  };

  const renderItem = useCallback(
    ({ item }: { item: StockImage }) => {
      const isSelected = loadingImage === item.filename;
      const imageUrl =
        item.url ||
        `${getGlobalApiClient().defaults.baseURL}/image-picker/stock-image/${item.filename}`;

      return (
        <Pressable
          style={[styles.imageItem, isSelected && styles.imageItemSelected]}
          onPress={() => handleImagePress(item)}
          disabled={loadingImage !== null}
        >
          <Image source={{ uri: imageUrl }} style={styles.thumbnail} contentFit="cover" />
          {isSelected && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="small" color={colors.white} />
            </View>
          )}
          {item.attribution && <UnsplashAttribution attribution={item.attribution} compact />}
        </Pressable>
      );
    },
    [loadingImage, handleImagePress]
  );

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoriesContainer}
      >
        {allCategories.map(renderCategoryPill)}
      </ScrollView>

      {isLoading && images.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            Lade Stock-Bilder...
          </Text>
        </View>
      ) : (
        <FlatList
          data={images}
          renderItem={renderItem}
          keyExtractor={(item) => item.filename}
          numColumns={NUM_COLUMNS}
          columnWrapperStyle={styles.columnWrapper}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="images-outline" size={48} color={theme.textSecondary} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                Keine Bilder gefunden
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  categoriesContainer: {
    gap: spacing.xsmall,
    paddingBottom: spacing.small,
  },
  categoryPill: {
    paddingVertical: spacing.xxsmall,
    paddingHorizontal: spacing.small,
    borderRadius: borderRadius.pill,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  categoryPillActive: {
    backgroundColor: colors.primary[600],
    borderColor: colors.primary[600],
  },
  categoryLabel: {
    ...typography.caption,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: spacing.xxlarge,
  },
  loadingText: {
    ...typography.body,
    marginTop: spacing.medium,
  },
  listContent: {
    paddingBottom: spacing.xxlarge,
  },
  columnWrapper: {
    gap: ITEM_GAP,
    marginBottom: ITEM_GAP,
  },
  imageItem: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    borderRadius: borderRadius.medium,
    overflow: 'hidden',
  },
  imageItemSelected: {
    borderWidth: 2,
    borderColor: colors.primary[600],
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: spacing.xxlarge,
  },
  emptyText: {
    ...typography.body,
    marginTop: spacing.medium,
  },
});
