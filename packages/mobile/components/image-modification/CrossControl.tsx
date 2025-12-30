import { View, Text, Pressable, StyleSheet, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, lightTheme, darkTheme } from '../../theme';
import {
  BALKEN_GRUPPE_STEP,
  SUNFLOWER_STEP,
  MODIFICATION_LABELS,
  type Offset2D,
} from '@gruenerator/shared/image-studio';

interface CrossControlProps {
  title: string;
  description: string;
  offset: Offset2D;
  onOffsetChange: (offset: Offset2D) => void;
  step: number;
  disabled?: boolean;
}

type Direction = 'up' | 'down' | 'left' | 'right';

export function CrossControl({
  title,
  description,
  offset,
  onOffsetChange,
  step,
  disabled = false,
}: CrossControlProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const handleMove = (direction: Direction) => {
    if (disabled) return;

    const [x, y] = offset;
    let newOffset: Offset2D;

    switch (direction) {
      case 'up':
        newOffset = [x, y - step];
        break;
      case 'down':
        newOffset = [x, y + step];
        break;
      case 'left':
        newOffset = [x - step, y];
        break;
      case 'right':
        newOffset = [x + step, y];
        break;
    }

    onOffsetChange(newOffset);
  };

  const ArrowButton = ({
    direction,
    icon,
  }: {
    direction: Direction;
    icon: keyof typeof Ionicons.glyphMap;
  }) => (
    <Pressable
      onPress={() => handleMove(direction)}
      disabled={disabled}
      style={[
        styles.arrowButton,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
        },
        disabled && styles.disabled,
      ]}
    >
      <Ionicons
        name={icon}
        size={20}
        color={disabled ? theme.textSecondary : colors.primary[600]}
      />
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      <Text style={[styles.description, { color: theme.textSecondary }]}>
        {description}
      </Text>

      <View style={styles.crossGrid}>
        <View style={styles.topRow}>
          <ArrowButton direction="up" icon="chevron-up" />
        </View>

        <View style={styles.middleRow}>
          <ArrowButton direction="left" icon="chevron-back" />

          <View style={[styles.centerDisplay, { backgroundColor: theme.surface }]}>
            <Text style={[styles.centerText, { color: theme.text }]}>
              {offset[0]},{offset[1]}
            </Text>
          </View>

          <ArrowButton direction="right" icon="chevron-forward" />
        </View>

        <View style={styles.bottomRow}>
          <ArrowButton direction="down" icon="chevron-down" />
        </View>
      </View>
    </View>
  );
}

interface BalkenGruppeControlProps {
  offset: Offset2D;
  onOffsetChange: (offset: Offset2D) => void;
  disabled?: boolean;
}

export function BalkenGruppeControl({
  offset,
  onOffsetChange,
  disabled = false,
}: BalkenGruppeControlProps) {
  return (
    <CrossControl
      title={MODIFICATION_LABELS.BALKEN_GRUPPE}
      description={MODIFICATION_LABELS.BALKEN_GRUPPE_DESC}
      offset={offset}
      onOffsetChange={onOffsetChange}
      step={BALKEN_GRUPPE_STEP}
      disabled={disabled}
    />
  );
}

interface SonnenblumenControlProps {
  offset: Offset2D;
  onOffsetChange: (offset: Offset2D) => void;
  disabled?: boolean;
}

export function SonnenblumenControl({
  offset,
  onOffsetChange,
  disabled = false,
}: SonnenblumenControlProps) {
  return (
    <CrossControl
      title={MODIFICATION_LABELS.SUNFLOWER}
      description={MODIFICATION_LABELS.SUNFLOWER_DESC}
      offset={offset}
      onOffsetChange={onOffsetChange}
      step={SUNFLOWER_STEP}
      disabled={disabled}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.small,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
  },
  description: {
    fontSize: 12,
  },
  crossGrid: {
    alignItems: 'center',
    gap: spacing.xsmall,
    paddingVertical: spacing.small,
  },
  topRow: {
    alignItems: 'center',
  },
  middleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
  },
  bottomRow: {
    alignItems: 'center',
  },
  arrowButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.medium,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerDisplay: {
    width: 64,
    height: 44,
    borderRadius: borderRadius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerText: {
    fontSize: 12,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  disabled: {
    opacity: 0.5,
  },
});
