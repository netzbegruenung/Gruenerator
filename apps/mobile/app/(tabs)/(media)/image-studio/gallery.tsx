/**
 * Image Studio Gallery Screen
 * Displays saved sharepics with edit and share actions
 */

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
  Alert,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useShareStore, type Share } from '@gruenerator/shared/share';
import { colors, spacing, borderRadius, lightTheme, darkTheme, typography } from '../../../../theme';
import { shareImage } from '../../../../services/imageStudio';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const NUM_COLUMNS = 2;
const ITEM_GAP = spacing.small;
const ITEM_SIZE = (SCREEN_WIDTH - spacing.medium * 2 - ITEM_GAP) / NUM_COLUMNS;

export default function GalleryScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const { shares, isLoading, fetchUserShares, deleteShare } = useShareStore();
  const [refreshing, setRefreshing] = useState(false);

  // Filter type state
  type FilterType = 'all' | 'uploaded' | 'created';
  const [filter, setFilter] = useState<FilterType>('all');

  // Filter images based on selected filter
  const filteredShares = useMemo(() => {
    const images = shares.filter((share) => share.mediaType === 'image');

    switch (filter) {
      case 'uploaded':
        return images.filter((share) => share.imageMetadata?.hasOriginalImage === true);
      case 'created':
        return images.filter((share) => share.imageMetadata?.hasOriginalImage === false);
      default:
        return images;
    }
  }, [shares, filter]);

  useEffect(() => {
    fetchUserShares('image');
  }, [fetchUserShares]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchUserShares('image');
    setRefreshing(false);
  }, [fetchUserShares]);

  const handleShare = useCallback(async (share: Share) => {
    if (!share.thumbnailUrl) return;

    try {
      // Fetch the full image and share it
      const response = await fetch(share.thumbnailUrl.replace('/thumbnail', ''));
      const blob = await response.blob();
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        await shareImage(base64);
      };
      reader.readAsDataURL(blob);
    } catch (error) {
      console.error('[Gallery] Share failed:', error);
      Alert.alert('Fehler', 'Bild konnte nicht geteilt werden.');
    }
  }, []);

  const handleDelete = useCallback((share: Share) => {
    Alert.alert(
      'Bild löschen?',
      'Das Bild wird unwiderruflich aus der Galerie entfernt.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteShare(share.shareToken);
            } catch (error) {
              console.error('[Gallery] Delete failed:', error);
              Alert.alert('Fehler', 'Bild konnte nicht gelöscht werden.');
            }
          },
        },
      ]
    );
  }, [deleteShare]);

  const renderItem = useCallback(({ item }: { item: Share }) => {
    const imageUrl = item.thumbnailUrl || `https://gruenerator.eu/share/${item.shareToken}/thumbnail`;

    return (
      <View style={styles.itemContainer}>
        <Pressable
          style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
          onPress={() => handleShare(item)}
        >
          <Image
            source={{ uri: imageUrl }}
            style={styles.itemImage}
            resizeMode="cover"
          />
          <View style={styles.itemOverlay}>
            <Text style={styles.itemTitle} numberOfLines={1}>
              {item.title || 'Sharepic'}
            </Text>
            <Text style={styles.itemDate}>
              {new Date(item.createdAt).toLocaleDateString('de-DE')}
            </Text>
          </View>
        </Pressable>
        <View style={styles.itemActions}>
          <Pressable
            style={styles.actionButton}
            onPress={() => handleShare(item)}
          >
            <Ionicons name="share-outline" size={18} color={colors.primary[600]} />
          </Pressable>
          <Pressable
            style={styles.actionButton}
            onPress={() => handleDelete(item)}
          >
            <Ionicons name="trash-outline" size={18} color={colors.error[500]} />
          </Pressable>
        </View>
      </View>
    );
  }, [handleShare, handleDelete]);

  const getEmptyStateContent = () => {
    switch (filter) {
      case 'uploaded':
        return {
          title: 'Keine hochgeladenen Bilder',
          text: 'Bearbeite ein eigenes Foto mit KI und es erscheint hier.',
        };
      case 'created':
        return {
          title: 'Keine erstellten Bilder',
          text: 'Erstelle ein Bild mit KI oder Templates und es erscheint hier.',
        };
      default:
        return {
          title: 'Noch keine Sharepics',
          text: 'Erstelle dein erstes Sharepic und es erscheint hier automatisch.',
        };
    }
  };

  const renderEmpty = () => {
    const emptyContent = getEmptyStateContent();
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="images-outline" size={64} color={theme.textSecondary} />
        <Text style={[styles.emptyTitle, { color: theme.text }]}>
          {emptyContent.title}
        </Text>
        <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
          {emptyContent.text}
        </Text>
        <Pressable
          style={styles.createButton}
          onPress={() => router.back()}
        >
          <Ionicons name="add-circle-outline" size={20} color={colors.primary[600]} />
          <Text style={styles.createButtonText}>Sharepic erstellen</Text>
        </Pressable>
      </View>
    );
  };

  if (isLoading && filteredShares.length === 0) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary[600]} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          Lade Galerie...
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Meine Sharepics</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.filterTabs}>
        <Pressable
          style={[styles.filterTab, filter === 'all' && styles.filterTabActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterTabText, filter === 'all' && styles.filterTabTextActive]}>
            Alle
          </Text>
        </Pressable>
        <Pressable
          style={[styles.filterTab, filter === 'uploaded' && styles.filterTabActive]}
          onPress={() => setFilter('uploaded')}
        >
          <Text style={[styles.filterTabText, filter === 'uploaded' && styles.filterTabTextActive]}>
            Hochgeladen
          </Text>
        </Pressable>
        <Pressable
          style={[styles.filterTab, filter === 'created' && styles.filterTabActive]}
          onPress={() => setFilter('created')}
        >
          <Text style={[styles.filterTabText, filter === 'created' && styles.filterTabTextActive]}>
            Erstellt
          </Text>
        </Pressable>
      </View>

      <FlatList
        data={filteredShares}
        renderItem={renderItem}
        keyExtractor={(item) => item.shareToken}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  backButton: {
    padding: spacing.xsmall,
  },
  headerTitle: {
    flex: 1,
    ...typography.h4,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 32,
  },
  filterTabs: {
    flexDirection: 'row',
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    gap: spacing.small,
  },
  filterTab: {
    paddingVertical: spacing.xsmall,
    paddingHorizontal: spacing.medium,
    borderRadius: borderRadius.full,
    backgroundColor: colors.gray[100],
  },
  filterTabActive: {
    backgroundColor: colors.primary[600],
  },
  filterTabText: {
    ...typography.caption,
    color: colors.gray[600],
  },
  filterTabTextActive: {
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
    backgroundColor: colors.gray[100],
  },
  itemPressed: {
    opacity: 0.8,
  },
  itemImage: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
  },
  itemOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: spacing.xsmall,
  },
  itemTitle: {
    ...typography.caption,
    color: colors.white,
    fontWeight: '600',
  },
  itemDate: {
    ...typography.caption,
    color: colors.gray[300],
    fontSize: 10,
  },
  itemActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.medium,
    paddingVertical: spacing.xsmall,
  },
  actionButton: {
    padding: spacing.xsmall,
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
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    marginTop: spacing.large,
    padding: spacing.medium,
    backgroundColor: colors.primary[50],
    borderRadius: borderRadius.medium,
  },
  createButtonText: {
    ...typography.body,
    color: colors.primary[600],
    fontWeight: '600',
  },
  loadingText: {
    ...typography.body,
    marginTop: spacing.medium,
  },
});
