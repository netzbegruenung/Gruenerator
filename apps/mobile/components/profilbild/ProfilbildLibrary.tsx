import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { Image } from 'expo-image';
import { useRouter, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';

import { type RecentItem } from '../../hooks/useRecentActivity';
import { useTheme } from '../../hooks/useTheme';
import { resolveWebUrl } from '../../services/webOrigin';
import { borderRadius, colors, spacing, typography, HEADING_FONT_BOLD } from '../../theme';

const OLDER = 64;

function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
}

function Circle({ item, size }: { item: RecentItem; size: number }) {
  const theme = useTheme();
  const uri = resolveWebUrl(item.thumbnailUrl);
  const style = { width: size, height: size, borderRadius: size / 2 };
  return uri ? (
    <Image
      source={{ uri }}
      placeholder={item.blurhash ? { blurhash: item.blurhash } : null}
      contentFit="cover"
      recyclingKey={item.id}
      style={style}
    />
  ) : (
    <View style={[style, { backgroundColor: theme.surface }]} />
  );
}

/**
 * What the Profilbild screen opens on once there are saved ones: the latest
 * large, a card to start a new one straight from the gallery or the camera,
 * and the older ones in a row. A first-timer never sees this — with nothing
 * saved the editor opens straight away.
 */
export function ProfilbildLibrary({
  items,
  width,
  onPick,
  onCamera,
}: {
  items: RecentItem[];
  width: number;
  onPick(): void;
  onCamera(): void;
}) {
  const theme = useTheme();
  const dark = useColorScheme() === 'dark';
  const router = useRouter();
  const [latest, ...older] = items;
  // Replace, not push: the reopened Profilbild takes this screen's place
  // instead of stacking a second editor on top.
  const reopen = (item: RecentItem) =>
    router.replace({ pathname: '/(focused)/profilbild', params: { share: item.id } } as Href);
  const hero = Math.round(Math.min(width * 0.62, 240));

  const action = (icon: IoniconsIconName, label: string, onPress: () => void, primary: boolean) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.action,
        primary
          ? { backgroundColor: colors.secondary[600] }
          : { backgroundColor: dark ? colors.grey[800] : colors.white },
        pressed && styles.pressed,
      ]}
    >
      <Ionicons name={icon} size={18} color={primary ? colors.white : colors.secondary[600]} />
      <Text style={[styles.actionText, { color: primary ? colors.white : theme.text }]}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <ScrollView
      style={{ width }}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {latest ? (
        <View style={styles.heroBlock}>
          <Pressable
            onPress={() => reopen(latest)}
            accessibilityRole="button"
            accessibilityLabel={`Aktuelles Profilbild „${latest.title}" bearbeiten`}
            style={({ pressed }) => [
              styles.heroRing,
              { borderRadius: hero, borderColor: colors.secondary[600] },
              pressed && styles.pressed,
            ]}
          >
            <Circle item={latest} size={hero} />
          </Pressable>
          <Text style={[styles.heroTitle, { color: theme.text }]}>Dein aktuelles Profilbild</Text>
          <Text style={[styles.meta, { color: theme.textSecondary }]}>
            {shortDate(latest.date)}
          </Text>
          <Pressable
            onPress={() => reopen(latest)}
            accessibilityRole="button"
            hitSlop={6}
            style={({ pressed }) => [styles.edit, pressed && styles.pressed]}
          >
            <Ionicons name="create-outline" size={16} color={colors.primary[600]} />
            <Text style={styles.editText}>Bearbeiten</Text>
          </Pressable>
        </View>
      ) : null}

      <View
        style={[styles.card, { backgroundColor: dark ? colors.grey[900] : colors.primary[50] }]}
      >
        <Text accessibilityRole="header" style={[styles.cardTitle, { color: theme.text }]}>
          Neues Profilbild
        </Text>
        <Text style={[styles.meta, { color: theme.textSecondary }]}>
          Foto wählen, wir stellen dich frei – Hintergrund und Sticker danach.
        </Text>
        <View style={styles.actions}>
          {action('images-outline', 'Galerie', onPick, true)}
          {action('camera-outline', 'Kamera', onCamera, false)}
        </View>
      </View>

      {older.length > 0 ? (
        <View style={styles.olderBlock}>
          <Text accessibilityRole="header" style={[styles.olderTitle, { color: theme.text }]}>
            Frühere
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.olderRow}
          >
            {older.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => reopen(item)}
                accessibilityRole="button"
                accessibilityLabel={`Profilbild „${item.title}" öffnen`}
                style={({ pressed }) => (pressed ? styles.pressed : null)}
              >
                <Circle item={item} size={OLDER} />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.large, paddingBottom: spacing.xlarge },
  heroBlock: { alignItems: 'center', gap: spacing.xxsmall },
  heroRing: { borderWidth: 3, padding: 4, marginBottom: spacing.small },
  heroTitle: { fontFamily: HEADING_FONT_BOLD, fontSize: 20 },
  meta: { ...typography.bodySmall },
  edit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
    marginTop: spacing.xsmall,
    minHeight: 32,
  },
  editText: { ...typography.bodyBold, color: colors.primary[600] },
  card: { borderRadius: borderRadius.xlarge, padding: spacing.medium, gap: spacing.xxsmall },
  cardTitle: { fontFamily: HEADING_FONT_BOLD, fontSize: 18 },
  actions: { flexDirection: 'row', gap: spacing.xsmall, marginTop: spacing.small },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxsmall,
    height: 44,
    borderRadius: borderRadius.full,
  },
  actionText: { ...typography.bodyBold },
  olderBlock: { gap: spacing.xsmall },
  olderTitle: { ...typography.bodyBold },
  olderRow: { gap: spacing.small },
  pressed: { opacity: 0.7 },
});
