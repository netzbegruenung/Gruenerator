import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useRouter, type Href } from 'expo-router';
import { View, Text, StyleSheet, Pressable, useColorScheme } from 'react-native';

import { colors, spacing, borderRadius, lightTheme, darkTheme, typography } from '../../theme';

import { type ToolDef } from './toolsConfig';

/**
 * Tools-tab launcher: one beautiful card per tool (icon tile · title + description ·
 * chevron). Light + eucalyptus styling. The Start screen keeps the compact circular
 * `ToolGrid`; this richer card list is the full launcher.
 */
export function ToolCardList({ tools }: { tools: ToolDef[] }) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? darkTheme : lightTheme;
  const router = useRouter();

  return (
    <View style={styles.list}>
      {tools.map((tool) => (
        <Pressable
          key={tool.id}
          onPress={() => router.push(tool.route as Href)}
          style={({ pressed }) => [
            styles.card,
            {
              backgroundColor: isDark ? colors.grey[800] : colors.secondary[50],
              opacity: pressed ? 0.9 : 1,
              transform: [{ scale: pressed ? 0.99 : 1 }],
            },
          ]}
        >
          <View
            style={[
              styles.iconTile,
              { backgroundColor: isDark ? colors.secondary[900] : colors.white },
            ]}
          >
            <Ionicons
              name={tool.icon}
              size={26}
              color={isDark ? colors.secondary[300] : colors.secondary[600]}
            />
          </View>

          <View style={styles.textColumn}>
            <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
              {tool.title}
            </Text>
            <Text style={[styles.description, { color: theme.textSecondary }]} numberOfLines={2}>
              {tool.description}
            </Text>
          </View>

          <Ionicons
            name="chevron-forward"
            size={20}
            color={isDark ? colors.grey[500] : colors.secondary[300]}
          />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.small,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.medium,
    padding: spacing.medium,
    borderRadius: borderRadius.large,
  },
  iconTile: {
    width: 52,
    height: 52,
    borderRadius: borderRadius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textColumn: {
    flex: 1,
  },
  title: {
    ...typography.label,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  description: {
    ...typography.caption,
    fontSize: 13,
    lineHeight: 18,
  },
});
