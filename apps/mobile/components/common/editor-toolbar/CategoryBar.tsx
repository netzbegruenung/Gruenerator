/**
 * CategoryBar Component
 * Horizontal bar with category chips for editing
 * Shared between image-studio and subtitle-editor
 */

import { View, Text, Pressable, ScrollView, StyleSheet, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  colors,
  spacing,
  borderRadius,
  lightTheme,
  darkTheme,
  moderateScale,
  verticalScale,
} from '../../../theme';

export interface CategoryConfig<T extends string = string> {
  id: T;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

export interface CategoryBarProps<T extends string = string> {
  categories: CategoryConfig<T>[];
  onSelectCategory: (categoryId: T) => void;
}

export function CategoryBar<T extends string = string>({
  categories,
  onSelectCategory,
}: CategoryBarProps<T>) {
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
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsContainer}
      >
        {categories.map((category) => (
          <Pressable
            key={category.id}
            style={[styles.chip, { backgroundColor: theme.background }]}
            onPress={() => onSelectCategory(category.id)}
          >
            <Ionicons name={category.icon} size={moderateScale(20)} color={colors.primary[600]} />
            <Text style={[styles.chipText, { color: theme.text, fontSize: moderateScale(15) }]}>
              {category.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
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
  chipsContainer: {
    paddingHorizontal: spacing.medium,
    gap: moderateScale(10),
    flexDirection: 'row',
    paddingBottom: verticalScale(24),
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: moderateScale(8),
    paddingVertical: moderateScale(14),
    paddingHorizontal: moderateScale(18),
    borderRadius: borderRadius.full,
  },
  chipText: {
    fontWeight: '500',
  },
});
