/**
 * TypeSelector Component
 * First step of KI image generation: pick the top-level intent —
 * transform (green-edit), create a new image, or edit an existing one.
 * Style variants live one step deeper, behind "Bild erstellen" (see StyleSelector).
 */

import { Ionicons } from '@react-native-vector-icons/ionicons';
import { type ImageSource } from 'expo-image';
import { View, Text, StyleSheet, useColorScheme, ScrollView } from 'react-native';

import { colors, spacing, borderRadius, lightTheme, darkTheme, typography } from '../../theme';

import { ImageCardGrid, type ImageCard } from './ImageCardGrid';

import type { ImageStudioKiType } from '@gruenerator/shared/image-studio';

interface TypeSelectorProps {
  onSelectEdit: (type: ImageStudioKiType) => void;
  onSelectCreate: () => void;
}

type IntentCard = ImageCard &
  ({ action: 'edit'; kiType: ImageStudioKiType } | { action: 'create' });

/* eslint-disable @typescript-eslint/no-require-imports */
// Image assets loaded via require() — Expo Metro provides typed module references
const INTENT_ITEMS: IntentCard[] = [
  {
    key: 'green-edit',
    label: 'Grün verwandeln',
    description: 'Straßen in grüne Räume verwandeln',
    image: require('../../images/imagine/green-street-example.webp') as ImageSource,
    fallbackIcon: 'leaf-outline',
    action: 'edit',
    kiType: 'green-edit',
  },
  {
    key: 'create',
    label: 'Bild erstellen',
    description: 'Neues KI-Bild aus einer Beschreibung',
    image: require('../../images/imagine/variants-pure/soft-illustration.webp') as ImageSource,
    fallbackIcon: 'color-wand-outline',
    action: 'create',
  },
  {
    key: 'universal-edit',
    label: 'Bild bearbeiten',
    description: 'Bild mit KI-Anweisungen bearbeiten',
    image: require('../../images/imagine/universal-edit.webp') as ImageSource,
    fallbackIcon: 'brush-outline',
    action: 'edit',
    kiType: 'universal-edit',
  },
];
/* eslint-enable @typescript-eslint/no-require-imports */

export function TypeSelector({ onSelectEdit, onSelectCreate }: TypeSelectorProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const isDark = colorScheme === 'dark';

  // Discriminated union — access through item.action so each branch narrows.
  const handlePress = (item: IntentCard) => {
    if (item.action === 'edit') {
      onSelectEdit(item.kiType);
    } else {
      onSelectCreate();
    }
  };

  return (
    <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
      <View style={styles.container}>
        <Text style={[styles.title, { color: theme.text }]}>KI-Bildgenerierung</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Erstelle oder bearbeite Bilder mit KI
        </Text>

        <ImageCardGrid items={INTENT_ITEMS} onPress={handlePress} />

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
    marginBottom: spacing.xsmall,
  },
  subtitle: {
    ...typography.body,
    marginBottom: spacing.large,
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
