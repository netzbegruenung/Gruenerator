import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, useColorScheme, ActivityIndicator } from 'react-native';

import { colors, lightTheme, darkTheme } from '../../theme';

interface MicButtonProps {
  isListening: boolean;
  onMicPress: () => void;
  hasText: boolean;
  onSubmit: () => void;
  loading?: boolean;
  disabled?: boolean;
  size?: number;
  submitIcon?: keyof typeof Ionicons.glyphMap;
}

export function MicButton({
  isListening,
  onMicPress,
  hasText,
  onSubmit,
  loading,
  disabled,
  size = 28,
  submitIcon = 'arrow-up',
}: MicButtonProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const showSubmit = hasText && !isListening;

  if (loading) {
    return (
      <Pressable
        disabled
        style={[styles.button, { width: size, height: size, borderRadius: size / 2 }]}
      >
        <ActivityIndicator size="small" color={colors.primary[600]} />
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={showSubmit ? onSubmit : onMicPress}
      hitSlop={8}
      disabled={disabled}
      style={[
        styles.button,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: isListening
            ? '#EF4444'
            : showSubmit
              ? colors.primary[600]
              : 'transparent',
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <Ionicons
        name={isListening ? 'stop' : showSubmit ? submitIcon : 'mic'}
        size={isListening ? size * 0.5 : size * 0.64}
        color={isListening || showSubmit ? colors.white : theme.textSecondary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
