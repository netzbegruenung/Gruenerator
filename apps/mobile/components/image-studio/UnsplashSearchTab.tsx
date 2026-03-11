import { Ionicons } from '@expo/vector-icons';
import { getGlobalApiClient } from '@gruenerator/shared/api';
import {
  useUnsplashSearch,
  searchUnsplashImages,
  trackUnsplashDownloadLive,
} from '@gruenerator/shared/image-studio';
import { Image } from 'expo-image';
import { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  useColorScheme,
  Dimensions,
  Alert,
} from 'react-native';

import { useDebouncedCallback } from '../../hooks/useDebounced';
import { fetchUnsplashImageForMobile } from '../../services/imageSourceService';
import { colors, spacing, borderRadius, lightTheme, darkTheme, typography } from '../../theme';

import { UnsplashAttribution } from './UnsplashAttribution';

import type { StockImage } from '@gruenerator/shared/image-studio';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const NUM_COLUMNS = 3;
const ITEM_GAP = spacing.xsmall;
const ITEM_SIZE = (SCREEN_WIDTH - spacing.medium * 2 - ITEM_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

interface UnsplashSearchTabProps {
  onImageSelected: (uri: string, base64: string) => void;
}

export function UnsplashSearchTab({ onImageSelected }: UnsplashSearchTabProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const isDark = colorScheme === 'dark';

  const searchFn = useMemo(
    () => (q: string, p: number, pp: number) =>
      searchUnsplashImages(getGlobalApiClient(), q, p, pp),
    []
  );

  const {
    searchResults,
    totalResults,
    currentPage,
    isLoadingSearch,
    searchError,
    lastQuery,
    searchUnsplash,
    loadMoreResults,
    clearSearch,
  } = useUnsplashSearch(searchFn);

  const [loadingImage, setLoadingImage] = useState<string | null>(null);

  const debouncedSearch = useDebouncedCallback((...args: unknown[]) => {
    const query = args[0] as string;
    if (query.trim()) {
      searchUnsplash(query);
    } else {
      clearSearch();
    }
  }, 500);

  const handleImagePress = useCallback(
    async (image: StockImage) => {
      setLoadingImage(image.filename);
      try {
        const result = await fetchUnsplashImageForMobile(image);

        if (image.attribution?.downloadLocation) {
          trackUnsplashDownloadLive(getGlobalApiClient(), image.attribution.downloadLocation).catch(
            () => {}
          );
        }

        onImageSelected(result.uri, result.base64);
      } catch (error) {
        Alert.alert('Fehler', 'Das Bild konnte nicht geladen werden.');
      } finally {
        setLoadingImage(null);
      }
    },
    [onImageSelected]
  );

  const hasMore = searchResults.length < totalResults;

  const renderItem = useCallback(
    ({ item }: { item: StockImage }) => {
      const isSelected = loadingImage === item.filename;

      return (
        <Pressable
          style={[styles.imageItem, isSelected && styles.imageItemSelected]}
          onPress={() => handleImagePress(item)}
          disabled={loadingImage !== null}
        >
          <Image source={{ uri: item.url }} style={styles.thumbnail} contentFit="cover" />
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

  const renderFooter = () => {
    if (!hasMore || searchResults.length === 0) return null;

    return (
      <Pressable
        onPress={loadMoreResults}
        disabled={isLoadingSearch}
        style={[
          styles.loadMoreButton,
          { backgroundColor: isDark ? colors.grey[800] : colors.grey[100] },
        ]}
      >
        {isLoadingSearch ? (
          <ActivityIndicator size="small" color={colors.primary[600]} />
        ) : (
          <Text style={[styles.loadMoreText, { color: colors.primary[600] }]}>Mehr laden</Text>
        )}
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.searchContainer,
          {
            backgroundColor: isDark ? colors.grey[900] : colors.grey[50],
            borderColor: isDark ? colors.grey[700] : colors.grey[300],
          },
        ]}
      >
        <Ionicons name="search-outline" size={18} color={theme.textSecondary} />
        <TextInput
          placeholder="Bilder auf Unsplash suchen..."
          placeholderTextColor={theme.textSecondary}
          style={[styles.searchInput, { color: theme.text }]}
          onChangeText={debouncedSearch}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>

      {searchError && <Text style={styles.errorText}>{searchError}</Text>}

      {!lastQuery && searchResults.length === 0 && (
        <View style={styles.emptyContainer}>
          <Ionicons name="search" size={48} color={theme.textSecondary} />
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            Suche nach Bildern auf Unsplash
          </Text>
        </View>
      )}

      {isLoadingSearch && searchResults.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
        </View>
      ) : (
        searchResults.length > 0 && (
          <FlatList
            data={searchResults}
            renderItem={renderItem}
            keyExtractor={(item, index) => `${item.filename}-${index}`}
            numColumns={NUM_COLUMNS}
            columnWrapperStyle={styles.columnWrapper}
            contentContainerStyle={styles.listContent}
            ListFooterComponent={renderFooter}
          />
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xsmall,
    borderRadius: borderRadius.large,
    borderWidth: 1,
    marginBottom: spacing.small,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    paddingVertical: 0,
  },
  errorText: {
    ...typography.caption,
    color: '#dc2626',
    marginBottom: spacing.small,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: spacing.xxlarge,
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
  loadMoreButton: {
    alignItems: 'center',
    paddingVertical: spacing.small,
    borderRadius: borderRadius.medium,
    marginTop: spacing.small,
  },
  loadMoreText: {
    ...typography.label,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: spacing.xxlarge * 2,
  },
  emptyText: {
    ...typography.body,
    marginTop: spacing.medium,
    textAlign: 'center',
  },
});
