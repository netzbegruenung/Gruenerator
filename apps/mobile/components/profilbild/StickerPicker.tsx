import { type StudioAssetItem, type StudioAssetScope } from '@gruenerator/contracts';
import { type ProfilbildSticker, stickersForLocale } from '@gruenerator/shared/profilbild';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { borderRadius, spacing, typography } from '../../theme';
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
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('gruene');
  return (
    <View style={styles.root}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Eigenen Sticker erstellen"
        onPress={() =>
          router.push({ pathname: '/(focused)/sticker-neu', params: { return: 'profilbild' } })
        }
        style={({ pressed }) => [
          styles.create,
          {
            borderColor: theme.border,
            backgroundColor: pressed ? theme.buttonBackground : 'transparent',
          },
        ]}
      >
        <Ionicons name="add-circle-outline" size={20} color={theme.textGreen} />
        <Text style={[styles.createText, { color: theme.textGreen }]}>
          Eigenen Sticker erstellen
        </Text>
      </Pressable>
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
  create: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xsmall,
    minHeight: 44,
    borderRadius: borderRadius.large,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
  },
  createText: { ...typography.bodyBold },
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
