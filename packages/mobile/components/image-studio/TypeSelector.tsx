/**
 * TypeSelector Component
 * Grid of template/KI type cards for image-studio with category tabs
 */

import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, useColorScheme, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type {
  ImageStudioTemplateType,
  ImageStudioKiType,
  ImageStudioCategory,
} from '@gruenerator/shared/image-studio';
import {
  getAllTemplateTypes,
  getAllKiTypes,
  getKiTypesBySubcategory,
} from '@gruenerator/shared/image-studio';
import { colors, spacing, borderRadius, lightTheme, darkTheme, typography } from '../../theme';

interface TypeSelectorProps {
  onSelectTemplate: (type: ImageStudioTemplateType) => void;
  onSelectKi: (type: ImageStudioKiType) => void;
}

const TEMPLATE_ICON_MAP: Record<ImageStudioTemplateType, keyof typeof Ionicons.glyphMap> = {
  dreizeilen: 'text-outline',
  zitat: 'chatbubbles-outline',
  'zitat-pure': 'chatbubble-outline',
  info: 'information-circle-outline',
  veranstaltung: 'calendar-outline',
  text2sharepic: 'sparkles-outline',
};

const KI_ICON_MAP: Record<ImageStudioKiType, keyof typeof Ionicons.glyphMap> = {
  'pure-create': 'color-wand-outline',
  'green-edit': 'leaf-outline',
  'universal-edit': 'brush-outline',
};

const CATEGORIES: { id: ImageStudioCategory; label: string }[] = [
  { id: 'templates', label: 'Templates' },
  { id: 'ki', label: 'KI' },
];

export function TypeSelector({ onSelectTemplate, onSelectKi }: TypeSelectorProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const isDark = colorScheme === 'dark';

  const [selectedCategory, setSelectedCategory] = useState<ImageStudioCategory>('templates');

  const templateTypes = getAllTemplateTypes();
  const kiCreateTypes = getKiTypesBySubcategory('create');
  const kiEditTypes = getKiTypesBySubcategory('edit');

  const renderCategoryTabs = () => (
    <View style={styles.tabContainer}>
      {CATEGORIES.map((cat) => {
        const isActive = selectedCategory === cat.id;
        return (
          <Pressable
            key={cat.id}
            onPress={() => setSelectedCategory(cat.id)}
            style={[
              styles.tab,
              {
                backgroundColor: isActive
                  ? colors.primary[600]
                  : isDark
                    ? colors.grey[800]
                    : colors.grey[100],
              },
            ]}
          >
            <Text
              style={[
                styles.tabText,
                {
                  color: isActive
                    ? colors.white
                    : isDark
                      ? colors.grey[300]
                      : colors.grey[600],
                },
              ]}
            >
              {cat.label}
            </Text>
            {cat.id === 'ki' && (
              <View style={styles.newBadge}>
                <Text style={styles.newBadgeText}>NEU</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );

  const renderTemplateGrid = () => (
    <View style={styles.grid}>
      {templateTypes.map((typeConfig) => (
        <Pressable
          key={typeConfig.id}
          onPress={() => onSelectTemplate(typeConfig.id)}
          style={({ pressed }) => [
            styles.card,
            {
              backgroundColor: isDark ? colors.grey[900] : colors.white,
              borderColor: isDark ? colors.grey[800] : colors.grey[200],
              opacity: pressed ? 0.8 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            },
          ]}
        >
          <View
            style={[
              styles.iconContainer,
              { backgroundColor: isDark ? colors.primary[900] : colors.primary[50] },
            ]}
          >
            <Ionicons
              name={TEMPLATE_ICON_MAP[typeConfig.id] || 'image-outline'}
              size={24}
              color={colors.primary[600]}
            />
          </View>
          <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
            {typeConfig.label}
          </Text>
          <Text style={[styles.cardDescription, { color: theme.textSecondary }]} numberOfLines={2}>
            {typeConfig.description}
          </Text>
          {typeConfig.isBeta && (
            <View style={styles.betaBadge}>
              <Text style={styles.betaText}>BETA</Text>
            </View>
          )}
        </Pressable>
      ))}
    </View>
  );

  const renderKiGrid = () => (
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
                <Text style={[styles.cardDescription, { color: theme.textSecondary }]} numberOfLines={2}>
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
                <Text style={[styles.cardDescription, { color: theme.textSecondary }]} numberOfLines={2}>
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

      <View style={[styles.rateLimitNote, { backgroundColor: isDark ? colors.grey[800] : colors.grey[100] }]}>
        <Ionicons name="information-circle-outline" size={16} color={theme.textSecondary} />
        <Text style={[styles.rateLimitText, { color: theme.textSecondary }]}>
          KI-Funktionen sind limitiert. Bei hoher Auslastung kann es zu Wartezeiten kommen.
        </Text>
      </View>
    </View>
  );

  return (
    <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
      <View style={styles.container}>
        <Text style={[styles.title, { color: theme.text }]}>
          {selectedCategory === 'templates'
            ? 'Welches Sharepic möchtest du erstellen?'
            : 'KI-Bildgenerierung'}
        </Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          {selectedCategory === 'templates'
            ? 'Wähle einen Template-Typ'
            : 'Erstelle oder bearbeite Bilder mit KI'}
        </Text>

        {renderCategoryTabs()}

        {selectedCategory === 'templates' ? renderTemplateGrid() : renderKiGrid()}
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
  tabContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.small,
    marginBottom: spacing.large,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.small,
    paddingHorizontal: spacing.medium,
    borderRadius: borderRadius.full,
    gap: spacing.xsmall,
  },
  tabText: {
    ...typography.label,
    fontWeight: '600',
  },
  newBadge: {
    backgroundColor: colors.primary[500],
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: borderRadius.small,
  },
  newBadgeText: {
    ...typography.caption,
    color: colors.white,
    fontSize: 9,
    fontWeight: '700',
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
  betaBadge: {
    position: 'absolute',
    top: spacing.small,
    right: spacing.small,
    backgroundColor: colors.primary[600],
    paddingVertical: 2,
    paddingHorizontal: spacing.xsmall,
    borderRadius: borderRadius.small,
  },
  betaText: {
    ...typography.caption,
    color: colors.white,
    fontSize: 10,
    fontWeight: '600',
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
