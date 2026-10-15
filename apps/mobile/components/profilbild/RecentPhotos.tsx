import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { Image } from 'expo-image';
import {
  AssetField,
  getPermissionsAsync,
  MediaType,
  presentPermissionsPicker,
  Query,
  requestPermissionsAsync,
  type Asset,
  type PermissionResponse,
} from 'expo-media-library';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { borderRadius, colors, spacing, typography } from '../../theme';

const COLUMNS = 3;
const GAP = 4;
/** Photos after the camera tile: ten rows' worth. */
const RECENT_COUNT = COLUMNS * 10 - 1;

type Access = 'unknown' | 'ask' | 'denied' | 'limited' | 'full';

function accessOf(p: PermissionResponse): Access {
  if (p.granted) return p.accessPrivileges === 'limited' ? 'limited' : 'full';
  return p.canAskAgain ? 'ask' : 'denied';
}

/**
 * The newest photos under the empty stage, Instagram-story style: one tap
 * starts the Profilbild. Reading the library needs its permission, so until it
 * is granted the grid offers to ask; the system picker behind „Alle Fotos"
 * needs none and always works.
 */
export function RecentPhotos({
  width,
  onPhoto,
  onCamera,
  onLibrary,
}: {
  width: number;
  /** A local file uri for the tapped photo. */
  onPhoto(uri: string): void;
  onCamera(): void;
  onLibrary(): void;
}) {
  const theme = useTheme();
  const [access, setAccess] = useState<Access>('unknown');
  const [photos, setPhotos] = useState<Asset[]>([]);
  const tile = Math.floor((width - GAP * (COLUMNS - 1)) / COLUMNS);

  const load = useCallback(async (permission: PermissionResponse) => {
    const next = accessOf(permission);
    setAccess(next);
    if (next !== 'full' && next !== 'limited') return;
    setPhotos(
      await new Query()
        .eq(AssetField.MEDIA_TYPE, MediaType.IMAGE)
        .orderBy({ key: AssetField.CREATION_TIME, ascending: false })
        .limit(RECENT_COUNT)
        .exe()
    );
  }, []);

  useEffect(() => {
    getPermissionsAsync(false, ['photo'])
      .then(load)
      .catch(() => setAccess('denied'));
  }, [load]);

  const ask = () => {
    requestPermissionsAsync(false, ['photo'])
      .then(load)
      .catch(() => setAccess('denied'));
  };
  const more = () => {
    presentPermissionsPicker(['photo'])
      .then(() => getPermissionsAsync(false, ['photo']))
      .then(load)
      .catch(() => {});
  };
  // The asset id (ph:// on iOS, content:// on Android) is no file; the
  // cutout needs one.
  const open = (asset: Asset) => {
    asset
      .getUri()
      .then(onPhoto)
      .catch(() => onPhoto(asset.id));
  };

  const action = (key: string, icon: IoniconsIconName, label: string, onPress: () => void) => (
    <Pressable
      key={key}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.tile,
        styles.action,
        { width: tile, height: tile, backgroundColor: theme.surface, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Ionicons name={icon} size={24} color={colors.primary[600]} />
      <Text style={[styles.actionText, { color: theme.text }]} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <View style={[styles.root, { width }]}>
      <View style={styles.head}>
        <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
          {access === 'full' || access === 'limited' ? 'Zuletzt' : 'Foto wählen'}
        </Text>
        <Pressable onPress={onLibrary} hitSlop={8} accessibilityRole="button">
          <Text style={styles.link}>Alle Fotos ›</Text>
        </Pressable>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.grid}>
        <Pressable
          onPress={onCamera}
          accessibilityRole="button"
          accessibilityLabel="Foto aufnehmen"
          style={({ pressed }) => [
            styles.tile,
            styles.action,
            { width: tile, height: tile, backgroundColor: colors.secondary[600] },
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="camera" size={26} color={colors.white} />
          <Text style={[styles.actionText, { color: colors.white }]}>Kamera</Text>
        </Pressable>
        {photos.map((asset, i) => (
          <Pressable
            key={asset.id}
            onPress={() => open(asset)}
            accessibilityRole="button"
            accessibilityLabel={`Foto ${i + 1} von ${photos.length}`}
            style={({ pressed }) => [
              styles.tile,
              { width: tile, height: tile },
              pressed && styles.pressed,
            ]}
          >
            <Image
              source={{ uri: asset.id }}
              contentFit="cover"
              recyclingKey={asset.id}
              style={StyleSheet.absoluteFill}
            />
          </Pressable>
        ))}
        {access === 'ask' ? action('ask', 'images-outline', 'Letzte Fotos zeigen', ask) : null}
        {access === 'denied'
          ? action('library', 'images-outline', 'Galerie öffnen', onLibrary)
          : null}
        {access === 'limited' ? action('more', 'add', 'Mehr Fotos freigeben', more) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xxsmall,
    paddingBottom: spacing.xsmall,
  },
  title: { ...typography.bodyBold },
  link: { ...typography.bodySmall, color: colors.primary[600], fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, paddingBottom: spacing.medium },
  tile: { borderRadius: borderRadius.small, overflow: 'hidden' },
  action: { alignItems: 'center', justifyContent: 'center', gap: spacing.xxsmall, padding: 6 },
  actionText: { ...typography.caption, fontWeight: '700', textAlign: 'center' },
  pressed: { opacity: 0.75 },
});
