import { Ionicons } from '@expo/vector-icons';
import { ScrollView, Pressable, Text, StyleSheet, useColorScheme } from 'react-native';

import { colors, spacing, borderRadius, lightTheme, darkTheme, typography } from '../../theme';

import type { ImageSourceTab } from '@gruenerator/shared/image-studio';

interface TabConfig {
  key: ImageSourceTab;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const TABS: TabConfig[] = [
  { key: 'device', label: 'Ger\u00e4t', icon: 'phone-portrait-outline' },
  { key: 'stock', label: 'Stock', icon: 'images-outline' },
  { key: 'unsplash', label: 'Unsplash', icon: 'search-outline' },
  { key: 'mediathek', label: 'Mediathek', icon: 'library-outline' },
];

interface ImageSourceTabsProps {
  activeTab: ImageSourceTab;
  onTabChange: (tab: ImageSourceTab) => void;
}

export function ImageSourceTabs({ activeTab, onTabChange }: ImageSourceTabsProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const isDark = colorScheme === 'dark';

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {TABS.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onTabChange(tab.key)}
            style={[
              styles.tab,
              isActive
                ? styles.tabActive
                : {
                    borderColor: isDark ? colors.grey[700] : colors.grey[300],
                    backgroundColor: isDark ? colors.grey[900] : colors.white,
                  },
            ]}
          >
            <Ionicons name={tab.icon} size={16} color={isActive ? colors.white : theme.text} />
            <Text style={[styles.tabLabel, { color: isActive ? colors.white : theme.text }]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xsmall,
    paddingVertical: spacing.small,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
    paddingVertical: spacing.xsmall,
    paddingHorizontal: spacing.small,
    borderRadius: borderRadius.pill,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tabActive: {
    backgroundColor: colors.primary[600],
    borderColor: colors.primary[600],
  },
  tabLabel: {
    ...typography.caption,
    fontWeight: '600',
  },
});
