import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { useEffect, useState, useCallback } from 'react';
import { Image } from 'expo-image';
import * as ExpoImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet, { BottomSheetView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { useRef } from 'react';
import { useMediaLibrary, useMediaUpload, type MediaItem } from '@gruenerator/shared/media-library';
import { colors, spacing, borderRadius, typography } from '../../../theme';

const NUM_COLUMNS = 3;

export default function MediathekScreen() {
  const bottomSheetRef = useRef<BottomSheet>(null);
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const {
    items,
    isLoading,
    error,
    refetch,
    deleteItem,
    loadMore,
    pagination,
    setFilters,
    filters,
  } = useMediaLibrary();

  const {
    upload,
    isUploading,
    progress,
    error: uploadError,
    reset: resetUpload,
  } = useMediaUpload({
    onSuccess: () => {
      refetch();
      resetUpload();
    },
  });

  useEffect(() => {
    refetch();
  }, [refetch]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const getMediaUrl = (item: MediaItem) => {
    if (item.thumbnailUrl) return item.thumbnailUrl;
    if (item.mediaUrl) return item.mediaUrl;
    return `https://gruenerator.eu/api/share/${item.shareToken}/preview`;
  };

  const handlePickImage = async () => {
    try {
      const permissionResult = await ExpoImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Berechtigung erforderlich', 'Bitte erlaube den Zugriff auf die Galerie.');
        return;
      }

      const result = await ExpoImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const response = await fetch(asset.uri);
        const blob = await response.blob();

        await upload(blob, {
          title: asset.fileName || `Bild_${Date.now()}`,
          uploadSource: 'upload',
        });
      }
    } catch (err) {
      Alert.alert('Fehler', 'Bild konnte nicht hochgeladen werden.');
    }
  };

  const handleTakePhoto = async () => {
    try {
      const permissionResult = await ExpoImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Berechtigung erforderlich', 'Bitte erlaube den Kamerazugriff.');
        return;
      }

      const result = await ExpoImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const response = await fetch(asset.uri);
        const blob = await response.blob();

        await upload(blob, {
          title: `Foto_${Date.now()}`,
          uploadSource: 'camera',
        });
      }
    } catch (err) {
      Alert.alert('Fehler', 'Foto konnte nicht aufgenommen werden.');
    }
  };

  const handleItemPress = (item: MediaItem) => {
    setSelectedItem(item);
    bottomSheetRef.current?.expand();
  };

  const handleDelete = () => {
    if (!selectedItem) return;

    Alert.alert(
      'Bild löschen',
      'Möchtest du dieses Bild wirklich löschen?',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: async () => {
            await deleteItem(selectedItem.id);
            bottomSheetRef.current?.close();
            setSelectedItem(null);
          },
        },
      ]
    );
  };

  const handleEndReached = () => {
    if (pagination.hasMore && !isLoading) {
      loadMore();
    }
  };

  const renderItem = ({ item }: { item: MediaItem }) => (
    <Pressable style={styles.gridItem} onPress={() => handleItemPress(item)}>
      <Image
        source={{ uri: getMediaUrl(item) }}
        style={styles.thumbnail}
        contentFit="cover"
        transition={200}
      />
      {item.mediaType === 'video' && (
        <View style={styles.videoIndicator}>
          <Ionicons name="play" size={16} color={colors.white} />
        </View>
      )}
    </Pressable>
  );

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
      />
    ),
    []
  );

  const renderEmpty = () => {
    if (isLoading) return null;

    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="images-outline" size={64} color={colors.grey[300]} />
        <Text style={styles.emptyTitle}>Noch keine Medien</Text>
        <Text style={styles.emptySubtitle}>
          Lade dein erstes Bild hoch, um loszulegen
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Filter chips */}
      <View style={styles.filterContainer}>
        <Pressable
          style={[styles.filterChip, filters.type === 'all' && styles.filterChipActive]}
          onPress={() => setFilters({ type: 'all' })}
        >
          <Text style={[styles.filterChipText, filters.type === 'all' && styles.filterChipTextActive]}>
            Alle
          </Text>
        </Pressable>
        <Pressable
          style={[styles.filterChip, filters.type === 'image' && styles.filterChipActive]}
          onPress={() => setFilters({ type: 'image' })}
        >
          <Ionicons
            name="image-outline"
            size={14}
            color={filters.type === 'image' ? colors.white : colors.grey[600]}
          />
          <Text style={[styles.filterChipText, filters.type === 'image' && styles.filterChipTextActive]}>
            Bilder
          </Text>
        </Pressable>
        <Pressable
          style={[styles.filterChip, filters.type === 'video' && styles.filterChipActive]}
          onPress={() => setFilters({ type: 'video' })}
        >
          <Ionicons
            name="videocam-outline"
            size={14}
            color={filters.type === 'video' ? colors.white : colors.grey[600]}
          />
          <Text style={[styles.filterChipText, filters.type === 'video' && styles.filterChipTextActive]}>
            Videos
          </Text>
        </Pressable>
      </View>

      {/* Upload progress */}
      {isUploading && (
        <View style={styles.uploadProgress}>
          <View style={[styles.uploadProgressBar, { width: `${progress}%` }]} />
          <Text style={styles.uploadProgressText}>
            Hochladen... {Math.round(progress)}%
          </Text>
        </View>
      )}

      {/* Error display */}
      {(error || uploadError) && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error || uploadError}</Text>
        </View>
      )}

      {/* Media grid */}
      {isLoading && items.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
          <Text style={styles.loadingText}>Laden...</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          numColumns={NUM_COLUMNS}
          contentContainerStyle={styles.gridContent}
          ListEmptyComponent={renderEmpty}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[colors.primary[600]]}
            />
          }
          ListFooterComponent={
            isLoading && items.length > 0 ? (
              <View style={styles.loadingMore}>
                <ActivityIndicator size="small" color={colors.primary[600]} />
              </View>
            ) : null
          }
        />
      )}

      {/* FAB for adding new media */}
      <Pressable style={styles.fab} onPress={handlePickImage}>
        <Ionicons name="add" size={28} color={colors.white} />
      </Pressable>

      {/* Bottom sheet for item details */}
      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={['40%']}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.bottomSheetBackground}
        handleIndicatorStyle={styles.bottomSheetIndicator}
        onClose={() => setSelectedItem(null)}
      >
        <BottomSheetView style={styles.bottomSheetContent}>
          {selectedItem && (
            <>
              <Image
                source={{ uri: getMediaUrl(selectedItem) }}
                style={styles.detailImage}
                contentFit="contain"
              />
              <Text style={styles.detailTitle}>
                {selectedItem.title || selectedItem.originalFilename || 'Unbenannt'}
              </Text>
              {selectedItem.altText && (
                <Text style={styles.detailAlt}>{selectedItem.altText}</Text>
              )}
              <View style={styles.detailActions}>
                <Pressable style={styles.actionButton} onPress={handleDelete}>
                  <Ionicons name="trash-outline" size={20} color={colors.red[600]} />
                  <Text style={[styles.actionButtonText, { color: colors.red[600] }]}>
                    Löschen
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </BottomSheetView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  filterContainer: {
    flexDirection: 'row',
    padding: spacing.medium,
    gap: spacing.small,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.xsmall,
    borderRadius: borderRadius.full,
    backgroundColor: colors.grey[100],
  },
  filterChipActive: {
    backgroundColor: colors.primary[600],
  },
  filterChipText: {
    ...typography.caption,
    color: colors.grey[600],
  },
  filterChipTextActive: {
    color: colors.white,
  },
  uploadProgress: {
    height: 32,
    backgroundColor: colors.grey[100],
    marginHorizontal: spacing.medium,
    marginBottom: spacing.small,
    borderRadius: borderRadius.medium,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  uploadProgressBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.primary[500],
  },
  uploadProgressText: {
    ...typography.caption,
    color: colors.grey[700],
    textAlign: 'center',
  },
  errorContainer: {
    backgroundColor: colors.red[50],
    marginHorizontal: spacing.medium,
    marginBottom: spacing.small,
    padding: spacing.small,
    borderRadius: borderRadius.medium,
  },
  errorText: {
    ...typography.caption,
    color: colors.red[600],
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.medium,
  },
  loadingText: {
    ...typography.body,
    color: colors.grey[500],
  },
  gridContent: {
    padding: spacing.xsmall,
  },
  gridItem: {
    flex: 1 / NUM_COLUMNS,
    aspectRatio: 1,
    padding: spacing.xxsmall,
  },
  thumbnail: {
    flex: 1,
    borderRadius: borderRadius.small,
    backgroundColor: colors.grey[100],
  },
  videoIndicator: {
    position: 'absolute',
    bottom: spacing.small,
    right: spacing.small,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: borderRadius.full,
    padding: spacing.xxsmall,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
    gap: spacing.small,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.grey[600],
  },
  emptySubtitle: {
    ...typography.body,
    color: colors.grey[400],
    textAlign: 'center',
    paddingHorizontal: spacing.xlarge,
  },
  loadingMore: {
    padding: spacing.medium,
    alignItems: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: spacing.large,
    right: spacing.large,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary[600],
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  bottomSheetBackground: {
    backgroundColor: colors.white,
  },
  bottomSheetIndicator: {
    backgroundColor: colors.grey[300],
  },
  bottomSheetContent: {
    padding: spacing.medium,
    alignItems: 'center',
    gap: spacing.medium,
  },
  detailImage: {
    width: '100%',
    height: 150,
    borderRadius: borderRadius.medium,
    backgroundColor: colors.grey[100],
  },
  detailTitle: {
    ...typography.h4,
    color: colors.grey[800],
    textAlign: 'center',
  },
  detailAlt: {
    ...typography.caption,
    color: colors.grey[500],
    textAlign: 'center',
  },
  detailActions: {
    flexDirection: 'row',
    gap: spacing.medium,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    borderRadius: borderRadius.medium,
    backgroundColor: colors.grey[50],
  },
  actionButtonText: {
    ...typography.button,
    fontSize: 14,
  },
});
