import { Image } from 'expo-image';
import { useRouter, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useRecentProfilbilder } from '../../hooks/useStudioMedia';
import { useTheme } from '../../hooks/useTheme';
import { resolveWebUrl } from '../../services/webOrigin';
import { colors, spacing, typography } from '../../theme';

const SIZE = 60;

/**
 * The saved Profilbilder as a row of circles above the photo grid — one tap
 * reopens one. Hidden while there are none.
 */
export function RecentProfilbilder({ width }: { width: number }) {
  const theme = useTheme();
  const router = useRouter();
  const items = useRecentProfilbilder();
  if (items.length === 0) return null;

  return (
    <View style={{ width }}>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
        Deine Profilbilder
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {items.map((item) => {
          const uri = resolveWebUrl(item.thumbnailUrl);
          return (
            <Pressable
              key={item.id}
              // Replace, not push: the reopened Profilbild takes this empty
              // editor's place instead of stacking a second one on top.
              onPress={() =>
                router.replace({
                  pathname: '/(focused)/profilbild',
                  params: { share: item.id },
                } as Href)
              }
              accessibilityRole="button"
              accessibilityLabel={`Profilbild „${item.title}" öffnen`}
              style={({ pressed }) => [styles.ring, pressed && styles.pressed]}
            >
              {uri ? (
                <Image
                  source={{ uri }}
                  placeholder={item.blurhash ? { blurhash: item.blurhash } : null}
                  contentFit="cover"
                  recyclingKey={item.id}
                  style={styles.thumb}
                />
              ) : (
                <View style={[styles.thumb, { backgroundColor: theme.surface }]} />
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    ...typography.bodyBold,
    paddingHorizontal: spacing.xxsmall,
    paddingBottom: spacing.xsmall,
  },
  row: { gap: spacing.small, paddingHorizontal: spacing.xxsmall },
  ring: {
    width: SIZE + 6,
    height: SIZE + 6,
    borderRadius: (SIZE + 6) / 2,
    borderWidth: 2,
    borderColor: colors.secondary[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumb: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, overflow: 'hidden' },
  pressed: { opacity: 0.7 },
});
