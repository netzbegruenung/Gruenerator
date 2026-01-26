/**
 * InlineBar Component
 * Inline editing bar that replaces the category bar temporarily
 * Shared between image-studio and subtitle-editor
 *
 * Note: Controls passed as children handle their own state via Zustand selectors
 */

import { type ReactNode } from 'react';
import { View, Pressable, StyleSheet, useColorScheme, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, lightTheme, darkTheme, moderateScale, verticalScale } from '../../../theme';

export interface InlineBarProps {
  children: ReactNode;
  onClose: () => void;
}

export function InlineBar({ children, onClose }: InlineBarProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.surface,
          borderTopColor: theme.border,
          paddingBottom: insets.bottom + spacing.small,
        },
      ]}
    >
      <View style={styles.header}>
        <Pressable
          onPress={onClose}
          hitSlop={12}
          style={[styles.closeButton, { backgroundColor: theme.background }]}
        >
          <Ionicons name="chevron-back" size={moderateScale(26)} color={theme.text} />
        </Pressable>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.controlContainer}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    paddingTop: verticalScale(28),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.medium,
    gap: moderateScale(12),
  },
  closeButton: {
    width: moderateScale(48),
    height: moderateScale(48),
    borderRadius: moderateScale(24),
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlContainer: {
    flexGrow: 1,
    paddingRight: spacing.medium,
    paddingBottom: verticalScale(24),
  },
});
