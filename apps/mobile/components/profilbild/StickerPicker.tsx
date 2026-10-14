import { type StudioAssetItem } from '@gruenerator/contracts';
import { type ProfilbildSticker, stickersForLocale } from '@gruenerator/shared/profilbild';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { borderRadius, spacing } from '../../theme';

import { ActionTile, GalleryTiles, PICKER_TILE } from './GalleryTiles';
import { PROFILBILD_ASSETS } from './profilbildAssets';
import { ProfilbildDiscoverButton } from './ProfilbildDiscoverButton';

const TILE = PICKER_TILE;

/**
 * One list without tabs, like web: the Grüne stickers, then the own and saved
 * ones, then Erstellen and Entdecken as tiles.
 */
export function StickerPicker({
  isAustria,
  onAdd,
  onAddGallery,
}: {
  isAustria: boolean;
  onAdd(sticker: ProfilbildSticker): void;
  onAddGallery(item: StudioAssetItem): void;
}) {
  const theme = useTheme();
  const router = useRouter();
  return (
    <View style={styles.root}>
      <View accessibilityLabel="Grüne Sticker" style={styles.row}>
        {stickersForLocale(isAustria ? 'de-AT' : 'de-DE').map((s) => (
          <Pressable
            key={s.id}
            accessibilityRole="button"
            accessibilityLabel={`Sticker „${s.label}“ hinzufügen`}
            onPress={() => onAdd(s)}
            style={({ pressed }) => [
              styles.tile,
              { backgroundColor: pressed ? theme.buttonBackground : theme.surface },
            ]}
          >
            <Image source={PROFILBILD_ASSETS[s.src]} contentFit="contain" style={styles.image} />
          </Pressable>
        ))}
      </View>
      <View accessibilityLabel="Deine Sticker">
        <GalleryTiles
          kind="sticker"
          source="own"
          onPick={onAddGallery}
          trailing={
            <>
              <ActionTile
                label="Sticker erstellen"
                onPress={() =>
                  router.push({
                    pathname: '/(focused)/sticker-neu',
                    params: { return: 'profilbild' },
                  })
                }
              >
                <Ionicons name="add" size={24} color={theme.textSecondary} />
              </ActionTile>
              <ProfilbildDiscoverButton kind="sticker" onPick={onAddGallery} />
            </>
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.small },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xsmall },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: borderRadius.large,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: { width: TILE - spacing.small, height: TILE - spacing.small },
});
