import { type ReactNode } from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator,
  type ViewStyle,
  type TextStyle,
  View,
} from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { colors, typography, spacing, borderRadius } from '../../theme';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost';

interface ButtonProps {
  onPress: () => void;
  children: ReactNode;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export function Button({
  onPress,
  children,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
  textStyle,
}: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;

  const handlePress = () => {
    if (isDisabled) return;
    // No haptic: a button is pressed dozens of times a session (onboarding's
    // „Weiter" six times in a row), and a buzz on every one is noise, not
    // feedback. The press state is the feedback; haptics are for commits and
    // detents (a sheet dragged away, a guide snapping).
    onPress();
  };

  const getButtonStyle = (): ViewStyle => {
    switch (variant) {
      case 'primary':
        return styles.primaryButton;
      case 'secondary':
        return styles.secondaryButton;
      case 'outline':
        return { ...styles.outlineButton, borderColor: theme.textGreen };
      case 'ghost':
        return styles.ghostButton;
    }
  };

  const getTextStyle = (): TextStyle => {
    switch (variant) {
      case 'primary':
        return styles.primaryText;
      case 'secondary':
        return styles.secondaryText;
      case 'outline':
      case 'ghost':
        return { color: theme.textGreen };
    }
  };

  const getIndicatorColor = (): string => {
    switch (variant) {
      case 'primary':
        return colors.white;
      case 'secondary':
        return colors.primary[600];
      case 'outline':
      case 'ghost':
        return theme.textGreen;
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      style={({ pressed }) => [
        styles.button,
        getButtonStyle(),
        isDisabled && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={getIndicatorColor()} />
      ) : typeof children === 'string' ? (
        <Text style={[styles.text, getTextStyle(), textStyle]}>{children}</Text>
      ) : (
        <View style={styles.contentRow}>
          <Text style={[styles.text, getTextStyle(), textStyle]}>{children}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: spacing.medium,
    paddingHorizontal: spacing.large,
    borderRadius: borderRadius.buttonPill,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  text: {
    ...typography.button,
  },
  primaryButton: {
    backgroundColor: colors.secondary[600],
  },
  primaryText: {
    color: colors.white,
  },
  secondaryButton: {
    backgroundColor: colors.secondary[100],
  },
  secondaryText: {
    color: colors.primary[700],
  },
  outlineButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
  ghostButton: {
    backgroundColor: 'transparent',
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.8,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
