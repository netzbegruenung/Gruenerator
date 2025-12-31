import { View, Text, StyleSheet, Pressable, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography, lightTheme, darkTheme } from '../../theme';

export type ReelMode = 'auto' | 'subtitle';

interface Mode {
  id: ReelMode;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const modes: Mode[] = [
  {
    id: 'auto',
    title: 'Automatisch',
    description: 'Ein Klick: Stille entfernen, Untertitel hinzufügen',
    icon: 'sparkles',
  },
  {
    id: 'subtitle',
    title: 'Manuell',
    description: 'Schnell Untertitel zu deinem Video hinzufügen',
    icon: 'text',
  },
];

interface ModeSelectorProps {
  onSelect: (mode: ReelMode) => void;
  onBack: () => void;
}

export function ModeSelector({ onSelect, onBack }: ModeSelectorProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Wie möchtest du fortfahren?</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Wähle einen Modus für dein Reel
        </Text>
      </View>

      <View style={styles.cardsContainer}>
        {modes.map((mode) => (
          <Pressable
            key={mode.id}
            style={({ pressed }) => [
              styles.card,
              {
                backgroundColor: theme.card,
                borderColor: pressed ? colors.primary[600] : theme.cardBorder,
              },
              pressed && styles.cardPressed,
            ]}
            onPress={() => onSelect(mode.id)}
          >
            <View style={[styles.iconContainer, { backgroundColor: colors.primary[50] }]}>
              <Ionicons name={mode.icon} size={32} color={colors.primary[600]} />
            </View>
            <Text style={[styles.cardTitle, { color: theme.text }]}>{mode.title}</Text>
            <Text style={[styles.cardDescription, { color: theme.textSecondary }]}>
              {mode.description}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.large,
  },
  header: {
    marginBottom: spacing.xlarge,
  },
  backButton: {
    alignSelf: 'flex-start',
    padding: spacing.xsmall,
    marginLeft: -spacing.xsmall,
    marginBottom: spacing.medium,
  },
  title: {
    ...typography.h2,
    marginBottom: spacing.xsmall,
  },
  subtitle: {
    ...typography.body,
  },
  cardsContainer: {
    gap: spacing.medium,
  },
  card: {
    borderRadius: borderRadius.large,
    borderWidth: 2,
    padding: spacing.large,
    alignItems: 'center',
  },
  cardPressed: {
    transform: [{ scale: 0.98 }],
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.medium,
  },
  cardTitle: {
    ...typography.h3,
    marginBottom: spacing.xsmall,
  },
  cardDescription: {
    ...typography.body,
    textAlign: 'center',
  },
});
