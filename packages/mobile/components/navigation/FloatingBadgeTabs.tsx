/**
 * Floating Badge Tabs
 * Spotify-style floating pill badges for tab navigation
 * Designed for reuse across all tab sections
 */

import React from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  useColorScheme,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, lightTheme, darkTheme } from '../../theme';

export interface TabDefinition {
  key: string;
  label: string;
}

interface FloatingBadgeTabsProps {
  tabs: TabDefinition[];
  activeTab: string;
  onTabPress: (tabKey: string) => void;
  style?: ViewStyle;
}

export function FloatingBadgeTabs({
  tabs,
  activeTab,
  onTabPress,
  style,
}: FloatingBadgeTabsProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        { top: insets.top + 8 },
        style,
      ]}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === activeTab;
        return (
          <TouchableOpacity
            key={tab.key}
            onPress={() => onTabPress(tab.key)}
            activeOpacity={0.7}
            style={[
              styles.badge,
              isActive
                ? styles.activeBadge
                : [styles.inactiveBadge, { backgroundColor: colorScheme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.08)' }],
            ]}
          >
            <Text
              style={[
                styles.label,
                isActive
                  ? styles.activeLabel
                  : { color: theme.text },
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    zIndex: 100,
    paddingHorizontal: 16,
  },
  badge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  activeBadge: {
    backgroundColor: colors.primary[600],
  },
  inactiveBadge: {
    // backgroundColor set dynamically based on theme
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  activeLabel: {
    color: colors.white,
  },
});
