/**
 * TypeSelector Component
 * Grid of template type cards for image-studio
 */

import { View, Text, StyleSheet, Pressable, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ImageStudioTemplateType } from '@gruenerator/shared/image-studio';
import { getAllTemplateTypes } from '@gruenerator/shared/image-studio';
import { colors, spacing, borderRadius, lightTheme, darkTheme, typography } from '../../theme';

interface TypeSelectorProps {
  onSelect: (type: ImageStudioTemplateType) => void;
}

const ICON_MAP: Record<ImageStudioTemplateType, keyof typeof Ionicons.glyphMap> = {
  dreizeilen: 'text-outline',
  zitat: 'chatbubbles-outline',
  'zitat-pure': 'chatbubble-outline',
  info: 'information-circle-outline',
  veranstaltung: 'calendar-outline',
  text2sharepic: 'sparkles-outline',
};

export function TypeSelector({ onSelect }: TypeSelectorProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const isDark = colorScheme === 'dark';

  const templateTypes = getAllTemplateTypes();

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: theme.text }]}>
        Welches Sharepic möchtest du erstellen?
      </Text>
      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
        Wähle einen Template-Typ
      </Text>

      <View style={styles.grid}>
        {templateTypes.map((typeConfig) => (
          <Pressable
            key={typeConfig.id}
            onPress={() => onSelect(typeConfig.id)}
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
                name={ICON_MAP[typeConfig.id] || 'image-outline'}
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
    </View>
  );
}

const styles = StyleSheet.create({
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
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.small,
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
});
