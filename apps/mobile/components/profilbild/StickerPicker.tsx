import { PROFILBILD_STICKERS, type ProfilbildSticker } from '@gruenerator/shared/profilbild';
import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { borderRadius, spacing } from '../../theme';

import { PROFILBILD_ASSETS } from './profilbildAssets';

const TILE = 64;

export function StickerPicker({ onAdd }: { onAdd(sticker: ProfilbildSticker): void }) {
  const theme = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {PROFILBILD_STICKERS.map((s) => (
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.xsmall, paddingVertical: spacing.xxsmall },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: borderRadius.large,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: { width: TILE - spacing.small, height: TILE - spacing.small },
});
