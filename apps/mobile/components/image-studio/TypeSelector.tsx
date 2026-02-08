/**
 * TypeSelector Component
 * Grid of KI type cards for image-studio
 */

import { Ionicons } from '@expo/vector-icons';
import { getKiTypesBySubcategory } from '@gruenerator/shared/image-studio';
import { View, Text, StyleSheet, Pressable, useColorScheme, ScrollView } from 'react-native';

import { colors, spacing, borderRadius, lightTheme, darkTheme, typography } from '../../theme';

import type { ImageStudioKiType } from '@gruenerator/shared/image-studio';

interface TypeSelectorProps {
  onSelectKi: (type: ImageStudioKiType) => void;
}

const KI_ICON_MAP: Record<ImageStudioKiType, keyof typeof Ionicons.glyphMap> = {
  'pure-create': 'color-wand-outline',
  'green-edit': 'leaf-outline',
  'universal-edit': 'brush-outline',
};

export function TypeSelector({ onSelectKi }: TypeSelectorProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const isDark = colorScheme === 'dark';

  const kiCreateTypes = getKiTypesBySubcategory('create');
  const kiEditTypes = getKiTypesBySubcategory('edit');

  return (
    <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
      <View style={styles.container}>
        <Text style={[styles.title, { color: theme.text }]}>KI-Bildgenerierung</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Erstelle oder bearbeite Bilder mit KI
        </Text>

        <View
          style={[
            styles.webHint,
            { backgroundColor: isDark ? colors.primary[900] : colors.primary[50] },
          ]}
        >
          <Ionicons name="desktop-outline" size={16} color={colors.primary[600]} />
          <Text
            style={[
              styles.webHintText,
              { color: isDark ? colors.primary[200] : colors.primary[700] },
            ]}
          >
            Template-Sharepics (Dreizeilen, Zitat, Info etc.) sind in der Web-Version auf
            gruenerator.de verfügbar.
          </Text>
        </View>

        <View style={styles.kiContainer}>
          {kiCreateTypes.length > 0 && (
            <View style={styles.subcategorySection}>
              <Text style={[styles.subcategoryTitle, { color: theme.textSecondary }]}>
                Bild erstellen
              </Text>
              <View style={styles.grid}>
                {kiCreateTypes.map((typeConfig) => (
                  <Pressable
                    key={typeConfig.id}
                    onPress={() => onSelectKi(typeConfig.id)}
                    style={({ pressed }) => [
                      styles.card,
                      styles.kiCard,
                      {
                        backgroundColor: isDark ? colors.grey[900] : colors.white,
                        borderColor: isDark ? colors.primary[800] : colors.primary[200],
                        opacity: pressed ? 0.8 : 1,
                        transform: [{ scale: pressed ? 0.98 : 1 }],
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.iconContainer,
                        styles.kiIconContainer,
                        { backgroundColor: isDark ? colors.primary[900] : colors.primary[100] },
                      ]}
                    >
                      <Ionicons
                        name={KI_ICON_MAP[typeConfig.id] || 'sparkles-outline'}
                        size={24}
                        color={colors.primary[500]}
                      />
                    </View>
                    <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
                      {typeConfig.label}
                    </Text>
                    <Text
                      style={[styles.cardDescription, { color: theme.textSecondary }]}
                      numberOfLines={2}
                    >
                      {typeConfig.description}
                    </Text>
                    <View style={styles.kiBadge}>
                      <Ionicons name="flash" size={10} color={colors.white} />
                      <Text style={styles.kiBadgeText}>KI</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {kiEditTypes.length > 0 && (
            <View style={styles.subcategorySection}>
              <Text style={[styles.subcategoryTitle, { color: theme.textSecondary }]}>
                Bild bearbeiten
              </Text>
              <View style={styles.grid}>
                {kiEditTypes.map((typeConfig) => (
                  <Pressable
                    key={typeConfig.id}
                    onPress={() => onSelectKi(typeConfig.id)}
                    style={({ pressed }) => [
                      styles.card,
                      styles.kiCard,
                      {
                        backgroundColor: isDark ? colors.grey[900] : colors.white,
                        borderColor: isDark ? colors.primary[800] : colors.primary[200],
                        opacity: pressed ? 0.8 : 1,
                        transform: [{ scale: pressed ? 0.98 : 1 }],
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.iconContainer,
                        styles.kiIconContainer,
                        { backgroundColor: isDark ? colors.primary[900] : colors.primary[100] },
                      ]}
                    >
                      <Ionicons
                        name={KI_ICON_MAP[typeConfig.id] || 'sparkles-outline'}
                        size={24}
                        color={colors.primary[500]}
                      />
                    </View>
                    <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
                      {typeConfig.label}
                    </Text>
                    <Text
                      style={[styles.cardDescription, { color: theme.textSecondary }]}
                      numberOfLines={2}
                    >
                      {typeConfig.description}
                    </Text>
                    <View style={styles.kiBadge}>
                      <Ionicons name="flash" size={10} color={colors.white} />
                      <Text style={styles.kiBadgeText}>KI</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

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
    marginBottom: spacing.medium,
  },
  webHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    padding: spacing.medium,
    borderRadius: borderRadius.medium,
    marginBottom: spacing.large,
  },
  webHintText: {
    ...typography.caption,
    flex: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.medium,
    justifyContent: 'center',
  },
  card: {
    width: '45%',
    minWidth: 150,
    padding: spacing.medium,
    borderRadius: borderRadius.large,
    borderWidth: 1,
    alignItems: 'center',
  },
  kiCard: {
    borderWidth: 1.5,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.small,
  },
  kiIconContainer: {
    borderWidth: 2,
    borderColor: colors.primary[300],
  },
  cardTitle: {
    ...typography.label,
    textAlign: 'center',
    marginBottom: spacing.xxsmall,
  },
  cardDescription: {
    ...typography.caption,
    textAlign: 'center',
  },
  kiBadge: {
    position: 'absolute',
    top: spacing.small,
    right: spacing.small,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.primary[500],
    paddingVertical: 2,
    paddingHorizontal: spacing.xsmall,
    borderRadius: borderRadius.small,
  },
  kiBadgeText: {
    ...typography.caption,
    color: colors.white,
    fontSize: 10,
    fontWeight: '600',
  },
  kiContainer: {
    gap: spacing.large,
  },
  subcategorySection: {
    gap: spacing.medium,
  },
  subcategoryTitle: {
    ...typography.label,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginLeft: spacing.small,
  },
  rateLimitNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    padding: spacing.medium,
    borderRadius: borderRadius.medium,
    marginTop: spacing.small,
  },
  rateLimitText: {
    ...typography.caption,
    flex: 1,
  },
});
