import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Image } from 'expo-image';
import { useRouter, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { type RecentItem } from '../../hooks/useRecentActivity';
import { useTheme } from '../../hooks/useTheme';
import { resolveWebUrl } from '../../services/webOrigin';
import { borderRadius, colors, spacing, typography } from '../../theme';

const COLUMNS = 3;

/**
 * What the Profilbild screen opens on once there are saved ones: those, as
 * circles, and „Neu" beside the heading for the empty editor. A first-timer
 * never sees this — with nothing saved the editor opens straight away.
 */
export function ProfilbildLibrary({
  items,
  width,
  onNew,
}: {
  items: RecentItem[];
  width: number;
  onNew(): void;
}) {
  const theme = useTheme();
  const router = useRouter();
  const gap = spacing.medium;
  const size = Math.floor((width - gap * (COLUMNS - 1)) / COLUMNS);
  const circle = { width: size, height: size, borderRadius: size / 2 };

  return (
    <View style={[styles.root, { width }]}>
      <View style={styles.head}>
        <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
          Deine Profilbilder
        </Text>
        <Pressable
          onPress={onNew}
          accessibilityRole="button"
          accessibilityLabel="Neues Profilbild"
          style={({ pressed }) => [styles.newButton, pressed && styles.pressed]}
        >
          <Ionicons name="add" size={18} color={colors.white} />
          <Text style={styles.newText}>Neu</Text>
        </Pressable>
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.grid, { gap }]}
      >
        {items.map((item) => {
          const uri = resolveWebUrl(item.thumbnailUrl);
          return (
            <Pressable
              key={item.id}
              // Replace, not push: the reopened Profilbild takes this screen's
              // place instead of stacking a second editor on top.
              onPress={() =>
                router.replace({
                  pathname: '/(focused)/profilbild',
                  params: { share: item.id },
                } as Href)
              }
              accessibilityRole="button"
              accessibilityLabel={`Profilbild „${item.title}" öffnen`}
              style={({ pressed }) => (pressed ? styles.pressed : null)}
            >
              {uri ? (
                <Image
                  source={{ uri }}
                  placeholder={item.blurhash ? { blurhash: item.blurhash } : null}
                  contentFit="cover"
                  recyclingKey={item.id}
                  style={circle}
                />
              ) : (
                <View style={[circle, { backgroundColor: theme.surface }]} />
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.medium,
  },
  title: { ...typography.h3 },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
    height: 40,
    paddingHorizontal: spacing.medium,
    borderRadius: borderRadius.full,
    backgroundColor: colors.secondary[600],
  },
  newText: { ...typography.bodyBold, color: colors.white },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingBottom: spacing.large },
  pressed: { opacity: 0.7 },
});
