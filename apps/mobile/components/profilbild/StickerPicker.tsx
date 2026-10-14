import { type StudioAssetItem, type StudioAssetScope } from '@gruenerator/contracts';
import { type ProfilbildSticker, stickersForLocale } from '@gruenerator/shared/profilbild';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { borderRadius, spacing } from '../../theme';
import { SegmentedControl } from '../common/SegmentedControl';

import { GALLERY_SCOPES } from './galleryModel';
import { GalleryStrip } from './GalleryStrip';
import { PROFILBILD_ASSETS } from './profilbildAssets';

const TILE = 64;

type Tab = 'gruene' | StudioAssetScope;

const TABS: { value: Tab; label: string }[] = [
  { value: 'gruene', label: 'Grüne' },
  ...GALLERY_SCOPES,
];

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
  const [tab, setTab] = useState<Tab>('gruene');
  return (
    <View style={styles.root}>
      <SegmentedControl
        accessibilityLabel="Sticker-Quelle"
        value={tab}
        onChange={(v) => setTab(v as Tab)}
        options={TABS.map((t) => ({ ...t, short: t.label, disabled: false }))}
      />
      {tab === 'gruene' ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
        >
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
        </ScrollView>
      ) : (
        <GalleryStrip kind="sticker" scope={tab} selectedSrc={null} onPick={onAddGallery} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.small },
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
