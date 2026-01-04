/**
 * MediathekSelector Component
 * Modal for selecting images from user's saved media library
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  FlatList,
  Image,
  ActivityIndicator,
  useColorScheme,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useShareStore, type Share } from '@gruenerator/shared/share';
import { colors, spacing, borderRadius, lightTheme, darkTheme, typography } from '../../theme';
import { fetchMediathekImage } from '../../services/imageStudio';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const NUM_COLUMNS = 3;
const ITEM_GAP = spacing.xsmall;
const ITEM_SIZE = (SCREEN_WIDTH - spacing.medium * 2 - ITEM_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

interface MediathekSelectorProps {
  visible: boolean;
  onClose: () => void;
  onImageSelect: (uri: string, base64: string) => void;
}

export function MediathekSelector({
  visible,
  onClose,
  onImageSelect,
}: MediathekSelectorProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const { shares, isLoading, fetchUserShares } = useShareStore();
  const [selectedToken, setSelectedToken] = useState<string | null>(null);
  const [loadingImage, setLoadingImage] = useState(false);

  // Filter for images with originals or AI-generated
  const mediathekImages = useMemo(() => {
    return shares.filter(share =>
      share.mediaType === 'image' && (
        share.imageMetadata?.hasOriginalImage === true ||
        share.imageType === 'pure-create'
      )
    );
  }, [shares]);

  useEffect(() => {
    if (visible) {
      fetchUserShares('image');
    }
  }, [visible, fetchUserShares]);

  const handleImagePress = useCallback(async (share: Share) => {
    setSelectedToken(share.shareToken);
    setLoadingImage(true);

    try {
      const result = await fetchMediathekImage(share);
      if (result) {
        onImageSelect(result.uri, result.base64);
        onClose();
      }
    } catch (error) {
      console.error('[MediathekSelector] Failed to load image:', error);
    } finally {
      setLoadingImage(false);
      setSelectedToken(null);
    }
  }, [onImageSelect, onClose]);

  const renderItem = useCallback(({ item }: { item: Share }) => {
    const isSelected = selectedToken === item.shareToken;
    const thumbnailUrl = item.thumbnailUrl || `https://gruenerator.eu/share/${item.shareToken}/thumbnail`;
    const isOriginal = item.imageMetadata?.hasOriginalImage === true;

    return (
      <Pressable
        style={[
          styles.imageItem,
          isSelected && styles.imageItemSelected,
        ]}
        onPress={() => handleImagePress(item)}
        disabled={loadingImage}
      >
        <Image
          source={{ uri: thumbnailUrl }}
          style={styles.thumbnail}
          resizeMode="cover"
        />
        {isSelected && loadingImage && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="small" color={colors.white} />
          </View>
        )}
        <View style={styles.typeIndicator}>
          <Ionicons
            name={isOriginal ? 'image-outline' : 'sparkles'}
            size={12}
            color={colors.white}
          />
        </View>
      </Pressable>
    );
  }, [selectedToken, loadingImage, handleImagePress]);

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="images-outline" size={48} color={theme.textSecondary} />
      <Text style={[styles.emptyTitle, { color: theme.text }]}>
        Keine Bilder verfügbar
      </Text>
      <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
        Erstelle zuerst Sharepics, um sie hier wiederzuverwenden.
      </Text>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <View style={styles.headerLeft} />
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            Mediathek
          </Text>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={theme.text} />
          </Pressable>
        </View>

        <View style={styles.infoBar}>
          <View style={styles.infoItem}>
            <Ionicons name="image-outline" size={14} color={theme.textSecondary} />
            <Text style={[styles.infoText, { color: theme.textSecondary }]}>
              Original
            </Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="sparkles" size={14} color={theme.textSecondary} />
            <Text style={[styles.infoText, { color: theme.textSecondary }]}>
              KI-generiert
            </Text>
          </View>
        </View>

        {isLoading && mediathekImages.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary[600]} />
            <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
              Lade Mediathek...
            </Text>
          </View>
        ) : (
          <FlatList
            data={mediathekImages}
            renderItem={renderItem}
            keyExtractor={(item) => item.shareToken}
            numColumns={NUM_COLUMNS}
            contentContainerStyle={styles.listContent}
            columnWrapperStyle={styles.columnWrapper}
            ListEmptyComponent={renderEmpty}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    borderBottomWidth: 1,
  },
  headerLeft: {
    width: 40,
  },
  headerTitle: {
    ...typography.h4,
    flex: 1,
    textAlign: 'center',
  },
  closeButton: {
    width: 40,
    alignItems: 'flex-end',
  },
  infoBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.large,
    paddingVertical: spacing.small,
    paddingHorizontal: spacing.medium,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
  },
  infoText: {
    ...typography.caption,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...typography.body,
    marginTop: spacing.medium,
  },
  listContent: {
    padding: spacing.medium,
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
    backgroundColor: colors.gray[100],
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
  typeIndicator: {
    position: 'absolute',
    bottom: spacing.xxsmall,
    right: spacing.xxsmall,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: borderRadius.full,
    padding: 4,
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
});
