/**
 * ImageCardGrid Component
 * Presentational 4:3 image-card grid shared by the Image Studio selection screens
 * (intent selection + style-variant selection). Generic over the item type so each
 * screen attaches its own discriminant fields and gets them back, typed, in onPress.
 */

import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { Image, type ImageSource } from 'expo-image';
import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  useColorScheme,
  useWindowDimensions,
} from 'react-native';

import { colors, spacing, lightTheme, darkTheme, typography } from '../../theme';

export interface ImageCard {
  key: string;
  label: string;
  description: string;
  image: ImageSource;
  fallbackIcon?: IoniconsIconName;
}

interface ImageCardGridProps<T extends ImageCard> {
  items: T[];
  onPress: (item: T) => void;
}

export function ImageCardGrid<T extends ImageCard>({ items, onPress }: ImageCardGridProps<T>) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  const { width: screenWidth } = useWindowDimensions();
  const gridPadding = spacing.medium * 2;
  const gap = spacing.small;
  const cardWidth = (screenWidth - gridPadding - gap) / 2;
  const cardHeight = (cardWidth * 4) / 3;

  const handleImageError = (key: string) => {
    setFailedImages((prev) => new Set(prev).add(key));
  };

  return (
    <View style={styles.grid}>
      {items.map((item) => (
        <Pressable
          key={item.key}
          onPress={() => onPress(item)}
          style={({ pressed }) => [
            styles.card,
            {
              width: cardWidth,
              height: cardHeight,
              opacity: pressed ? 0.9 : 1,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            },
          ]}
        >
          {failedImages.has(item.key) ? (
            <View
              style={[
                styles.fallbackContainer,
                { backgroundColor: isDark ? colors.grey[800] : colors.grey[200] },
              ]}
            >
              <Ionicons
                name={item.fallbackIcon ?? 'image-outline'}
                size={32}
                color={colors.primary[500]}
              />
            </View>
          ) : (
            <Image
              source={item.image}
              style={styles.cardImage}
              contentFit="cover"
              onError={() => handleImageError(item.key)}
            />
          )}

          <View style={styles.gradientOverlay} />

          <View style={styles.cardContent}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item.label}
            </Text>
            <Text style={styles.cardDescription} numberOfLines={2}>
              {item.description}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.small,
    justifyContent: 'space-between',
    marginBottom: spacing.medium,
  },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#1a1a1a',
  },
  cardImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  fallbackContainer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  cardContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.medium,
  },
  cardTitle: {
    ...typography.label,
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  cardDescription: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
