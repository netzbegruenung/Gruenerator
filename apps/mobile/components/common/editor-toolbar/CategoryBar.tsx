/**
 * CategoryBar Component
 * Horizontal bar with category chips for editing
 * Shared between image-studio and subtitle-editor
 */

import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { View, Text, Pressable, ScrollView, StyleSheet, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing, borderRadius, lightTheme, darkTheme, uiScale } from '../../../theme';

import type { ReactNode } from 'react';

export interface CategoryConfig<T extends string = string> {
  id: T;
  label: string;
  icon: IoniconsIconName;
}

export interface CategoryBarProps<T extends string = string> {
  categories: CategoryConfig<T>[];
  onSelectCategory: (categoryId: T) => void;
  trailing?: ReactNode;
}

export function CategoryBar<T extends string = string>({
  categories,
  onSelectCategory,
  trailing,
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
            <Ionicons name={category.icon} size={uiScale(20)} color={colors.primary[600]} />
            <Text style={[styles.chipText, { color: theme.text, fontSize: uiScale(15) }]}>
              {category.label}
            </Text>
          </Pressable>
        ))}
        {trailing}
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
    paddingTop: uiScale(28),
  },
  chipsContainer: {
    paddingHorizontal: spacing.medium,
    gap: uiScale(10),
    flexDirection: 'row',
    paddingBottom: uiScale(24),
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: uiScale(8),
    paddingVertical: uiScale(14),
    paddingHorizontal: uiScale(18),
    borderRadius: borderRadius.full,
  },
  chipText: {
    fontWeight: '500',
  },
});
