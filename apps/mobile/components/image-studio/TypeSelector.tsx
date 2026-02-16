/**
 * TypeSelector Component
 * Unified grid of image-based cards for KI type + variant selection
 */

import { Ionicons } from '@expo/vector-icons';
import { STYLE_VARIANTS } from '@gruenerator/shared/image-studio';
import { Image, type ImageSource } from 'expo-image';
import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  useColorScheme,
  ScrollView,
  Dimensions,
} from 'react-native';

import { colors, spacing, borderRadius, lightTheme, darkTheme, typography } from '../../theme';

import type { ImageStudioKiType, KiStyleVariant } from '@gruenerator/shared/image-studio';

interface TypeSelectorProps {
  onSelectVariant: (variant: KiStyleVariant) => void;
  onSelectEdit: (type: ImageStudioKiType) => void;
}

interface CardItem {
  key: string;
  label: string;
  description: string;
  image: ImageSource;
  type: 'variant' | 'edit';
  variant?: KiStyleVariant;
  kiType?: ImageStudioKiType;
}

/* eslint-disable @typescript-eslint/no-require-imports */
const VARIANT_IMAGES: Record<KiStyleVariant, ImageSource> = {
  'illustration-pure': require('../../images/imagine/variants-pure/soft-illustration.webp'),
  'realistic-pure': require('../../images/imagine/variants-pure/realistic-photo.webp'),
  'pixel-pure': require('../../images/imagine/variants-pure/pixel-art.webp'),
  'editorial-pure': require('../../images/imagine/variants-pure/editorial.webp'),
};

const EDIT_IMAGES: Record<string, ImageSource> = {
  'green-edit': require('../../images/imagine/green-street-example.webp'),
  'universal-edit': require('../../images/imagine/universal-edit.webp'),
};

function buildCardItems(): CardItem[] {
  const items: CardItem[] = [];

  items.push({
    key: 'green-edit',
    label: 'Grün verwandeln',
    description: 'Straßen in grüne Räume verwandeln',
    image: EDIT_IMAGES['green-edit'],
    type: 'edit',
    kiType: 'green-edit',
  });

  for (const v of STYLE_VARIANTS) {
    items.push({
      key: v.id,
      label: v.label,
      description: v.description,
      image: VARIANT_IMAGES[v.id],
      type: 'variant',
      variant: v.id,
    });
  }

  items.push({
    key: 'universal-edit',
    label: 'Bild bearbeiten',
    description: 'Bild mit KI-Anweisungen bearbeiten',
    image: EDIT_IMAGES['universal-edit'],
    type: 'edit',
    kiType: 'universal-edit',
  });

  return items;
}

const CARD_ITEMS = buildCardItems();

export function TypeSelector({ onSelectVariant, onSelectEdit }: TypeSelectorProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const isDark = colorScheme === 'dark';
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  const screenWidth = Dimensions.get('window').width;
  const gridPadding = spacing.medium * 2;
  const gap = spacing.small;
  const cardWidth = (screenWidth - gridPadding - gap) / 2;
  const cardHeight = (cardWidth * 4) / 3;

  const handlePress = (item: CardItem) => {
    if (item.type === 'variant' && item.variant) {
      onSelectVariant(item.variant);
    } else if (item.type === 'edit' && item.kiType) {
      onSelectEdit(item.kiType);
    }
  };

  const handleImageError = (key: string) => {
    setFailedImages((prev) => new Set(prev).add(key));
  };

  return (
    <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
      <View style={styles.container}>
        <Text style={[styles.title, { color: theme.text }]}>KI-Bildgenerierung</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Erstelle oder bearbeite Bilder mit KI
        </Text>

        <View style={styles.grid}>
          {CARD_ITEMS.map((item) => (
            <Pressable
              key={item.key}
              onPress={() => handlePress(item)}
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
                    name={item.type === 'variant' ? 'color-wand-outline' : 'brush-outline'}
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

        <View
          style={[
            styles.rateLimitNote,
            { backgroundColor: isDark ? colors.grey[800] : colors.grey[100] },
          ]}
        >
          <Ionicons name="information-circle-outline" size={16} color={theme.textSecondary} />
          <Text style={[styles.rateLimitText, { color: theme.textSecondary }]}>
            KI-Funktionen sind limitiert. Bei hoher Auslastung kann es zu Wartezeiten kommen.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  container: {
    flex: 1,
    padding: spacing.medium,
  },
  title: {
    ...typography.h3,
    textAlign: 'center',
    marginBottom: spacing.xsmall,
  },
  subtitle: {
    ...typography.body,
    textAlign: 'center',
    marginBottom: spacing.large,
  },
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
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
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
  rateLimitNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    padding: spacing.medium,
    borderRadius: borderRadius.medium,
  },
  rateLimitText: {
    ...typography.caption,
    flex: 1,
  },
});
