/**
 * StyleSelector Component
 * Second step of "Bild erstellen": pick the art style for a pure-create image.
 * Reached from TypeSelector's "Bild erstellen" card.
 */

import { STYLE_VARIANTS } from '@gruenerator/shared/image-studio';
import { type ImageSource } from 'expo-image';
import { View, Text, StyleSheet, useColorScheme, ScrollView } from 'react-native';

import { spacing, lightTheme, darkTheme, typography } from '../../theme';

import { ImageCardGrid, type ImageCard } from './ImageCardGrid';

import type { KiStyleVariant } from '@gruenerator/shared/image-studio';

interface StyleSelectorProps {
  onSelectVariant: (variant: KiStyleVariant) => void;
}

interface VariantCard extends ImageCard {
  variant: KiStyleVariant;
}

/* eslint-disable @typescript-eslint/no-require-imports */
// Image assets loaded via require() — Expo Metro provides typed module references
const VARIANT_IMAGES: Record<KiStyleVariant, ImageSource> = {
  'illustration-pure':
    require('../../images/imagine/variants-pure/soft-illustration.webp') as ImageSource,
  'realistic-pure':
    require('../../images/imagine/variants-pure/realistic-photo.webp') as ImageSource,
  'pixel-pure': require('../../images/imagine/variants-pure/pixel-art.webp') as ImageSource,
  'editorial-pure': require('../../images/imagine/variants-pure/editorial.webp') as ImageSource,
};
/* eslint-enable @typescript-eslint/no-require-imports */

const VARIANT_ITEMS: VariantCard[] = STYLE_VARIANTS.map((v) => ({
  key: v.id,
  label: v.label,
  description: v.description,
  image: VARIANT_IMAGES[v.id],
  fallbackIcon: 'color-wand-outline',
  variant: v.id,
}));

export function StyleSelector({ onSelectVariant }: StyleSelectorProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  return (
    <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
      <View style={styles.container}>
        <Text style={[styles.title, { color: theme.text }]}>Bild erstellen</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Wähle einen Stil für dein neues Bild
        </Text>

        <ImageCardGrid items={VARIANT_ITEMS} onPress={(item) => onSelectVariant(item.variant)} />
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
    marginBottom: spacing.xsmall,
  },
  subtitle: {
    ...typography.body,
    marginBottom: spacing.large,
  },
});
