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
  type ViewStyle,
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
  /**
   * Render in the normal flow instead of floating over the screen. Use this below
   * a `ScreenScaffold` header, where the default absolute placement would land on
   * top of the title bar.
   */
  inline?: boolean;
}

export function FloatingBadgeTabs({
  tabs,
  activeTab,
  onTabPress,
  style,
  inline = false,
}: FloatingBadgeTabsProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.row,
        inline ? styles.inline : [styles.floating, { top: insets.top + 8 }],
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
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={tab.label}
            style={[
              styles.badge,
              isActive
                ? styles.activeBadge
                : [
                    styles.inactiveBadge,
                    {
                      backgroundColor:
                        colorScheme === 'dark'
                          ? 'rgba(255, 255, 255, 0.15)'
                          : 'rgba(0, 0, 0, 0.08)',
                    },
                  ],
            ]}
          >
            <Text style={[styles.label, isActive ? styles.activeLabel : { color: theme.text }]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  floating: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 100,
  },
  inline: {
    paddingBottom: 8,
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
