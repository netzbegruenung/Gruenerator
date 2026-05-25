import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useRouter, type Href } from 'expo-router';
import { View, Text, StyleSheet, Pressable, useColorScheme } from 'react-native';

import { useToolFavoritesStore } from '../../stores/toolFavoritesStore';
import { colors, spacing, lightTheme, darkTheme } from '../../theme';

import { type ToolDef } from './toolsConfig';

export { type ToolDef } from './toolsConfig';

/**
 * Circular-icon tool grid shared by the Start screen (compact) and the Tools tab
 * (`large`). Long-press toggles a tool as favorite (persisted), shown via a star
 * badge; the Start screen renders only favorites from this same component.
 */
export function ToolGrid({ tools, large = false }: { tools: ToolDef[]; large?: boolean }) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const router = useRouter();
  const favorites = useToolFavoritesStore((s) => s.favorites);
  const toggleFavorite = useToolFavoritesStore((s) => s.toggleFavorite);

  return (
    <View style={styles.toolGrid}>
      {tools.map((tool) => {
        const isFavorite = favorites.includes(tool.id);
        return (
          <Pressable
            key={tool.id}
            onPress={() => router.push(tool.route as Href)}
            onLongPress={() => toggleFavorite(tool.id)}
            delayLongPress={300}
            style={({ pressed }) => [styles.toolItem, { opacity: pressed ? 0.6 : 1 }]}
          >
            <View
              style={[
                styles.toolCircle,
                large ? styles.toolCircleLarge : styles.toolCircleNormal,
                colorScheme === 'dark' ? styles.toolCircleDark : styles.toolCircleLight,
              ]}
            >
              <Ionicons
                name={tool.icon}
                size={large ? 38 : 24}
                color={colorScheme === 'dark' ? colors.grey[200] : colors.secondary[600]}
              />
              {isFavorite ? (
                <View style={[styles.favBadge, { borderColor: theme.background }]}>
                  <Ionicons name="star" size={10} color={colors.white} />
                </View>
              ) : null}
            </View>
            <Text
              style={[large ? styles.toolLabelLarge : styles.toolLabel, { color: theme.text }]}
              numberOfLines={1}
            >
              {tool.title}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  toolGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-evenly',
  },
  toolItem: {
    width: '33%',
    alignItems: 'center',
    paddingVertical: spacing.medium,
  },
  toolCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.small,
  },
  toolCircleNormal: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  toolCircleLarge: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  toolCircleLight: {
    backgroundColor: colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  toolCircleDark: {
    backgroundColor: colors.grey[700],
  },
  favBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary[600],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  toolLabel: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  toolLabelLarge: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
});
