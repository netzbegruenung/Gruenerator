import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useRouter, type Href } from 'expo-router';
import { View, Text, StyleSheet, Pressable, ScrollView, useColorScheme } from 'react-native';

import { useToolFavoritesStore } from '../../stores/toolFavoritesStore';
import { colors, spacing, borderRadius, lightTheme, darkTheme } from '../../theme';

import { type ToolDef } from './toolsConfig';

/**
 * Section heading (title + optional pill badge) — the mobile echo of the web
 * workplace `SectionHeading` used across the Arbeiten tab.
 */
export function ToolSectionHeading({ title, badge }: { title: string; badge?: string }) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? darkTheme : lightTheme;

  return (
    <View style={styles.headingRow}>
      <Text style={[styles.headingTitle, { color: theme.text }]}>{title}</Text>
      {badge ? (
        <View
          style={[
            styles.badge,
            { backgroundColor: isDark ? colors.secondary[900] : colors.secondary[50] },
          ]}
        >
          <Text
            style={[
              styles.badgeText,
              { color: isDark ? colors.secondary[300] : colors.secondary[600] },
            ]}
          >
            {badge}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Compact tool tiles in a single horizontally-scrollable row: a small ghost icon +
 * title on top, short description underneath. Echoes the web workplace tool grid but
 * fitted to a phone — the row scrolls instead of wrapping.
 */
export function ToolTileGrid({ tools }: { tools: ToolDef[] }) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? darkTheme : lightTheme;
  const router = useRouter();
  const iconColor = isDark ? colors.secondary[300] : colors.secondary[600];
  const favorites = useToolFavoritesStore((s) => s.favorites);
  const toggleFavorite = useToolFavoritesStore((s) => s.toggleFavorite);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {tools.map((tool) => {
        const isFavorite = favorites.includes(tool.id);
        return (
          <Pressable
            key={tool.id}
            onPress={() => router.push(tool.route as Href)}
            style={({ pressed }) => [
              styles.tile,
              {
                backgroundColor: theme.card,
                borderColor: theme.cardBorder,
                opacity: pressed ? 0.9 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              },
            ]}
          >
            <View style={styles.tileHead}>
              <Ionicons name={tool.icon} size={18} color={iconColor} />
              <Text style={[styles.tileTitle, { color: theme.text }]} numberOfLines={1}>
                {tool.title}
              </Text>
              <Pressable onPress={() => toggleFavorite(tool.id)} hitSlop={8} style={styles.star}>
                <Ionicons
                  name={isFavorite ? 'star' : 'star-outline'}
                  size={16}
                  color={isFavorite ? colors.secondary[500] : theme.textSecondary}
                />
              </Pressable>
            </View>
            <Text style={[styles.tileDesc, { color: theme.textSecondary }]} numberOfLines={2}>
              {tool.description}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    marginBottom: spacing.small,
  },
  headingTitle: {
    fontFamily: 'Raleway_700Bold',
    fontSize: 20,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  badgeText: {
    fontFamily: 'Raleway_600SemiBold',
    fontSize: 12,
  },
  row: {
    gap: spacing.small,
    paddingRight: spacing.medium,
  },
  tile: {
    width: 168,
    borderRadius: borderRadius.xlarge,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.small,
  },
  tileHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
  },
  tileTitle: {
    flexShrink: 1,
    fontFamily: 'Raleway_600SemiBold',
    fontSize: 15,
  },
  star: {
    marginLeft: 'auto',
    padding: 2,
  },
  tileDesc: {
    fontSize: 12.5,
    lineHeight: 17,
    marginTop: spacing.xxsmall,
  },
});
