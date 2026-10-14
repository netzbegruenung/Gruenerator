import { type StudioAssetItem } from '@gruenerator/contracts';
import {
  colorSwatches,
  FREE_BACKGROUND_ID,
  gradientSwatches,
  presetDesigns,
  type FreeBackground,
  type PresetDesign,
  type ProfilbildAssetSrc,
  type Swatch,
} from '@gruenerator/shared/profilbild';
import { isShareSrc } from '@gruenerator/shared/stickers';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Skia, type SkImage } from '@shopify/react-native-skia';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { resolveChatUrl } from '../../services/chatApiUrl';
import { pickImageForEditor } from '../../services/imageEditMobile';
import { borderRadius, spacing } from '../../theme';
import { SegmentedControl } from '../common/SegmentedControl';
import { useShareToken } from '../studio-assets/useShareToken';

import { FlatFill } from './FlatFill';
import { cdPalette } from './freeColorModel';
import { FreeColorTile } from './FreeColorTile';
import { ActionTile, GalleryTiles, PICKER_TILE } from './GalleryTiles';
import { PROFILBILD_ASSETS } from './profilbildAssets';
import { ProfilbildDiscoverButton } from './ProfilbildDiscoverButton';
import { type MobileBackground } from './sceneModel';

export const CUSTOM_ID = 'eigenes-bild';

export interface CustomBackground {
  uri: string;
  image: SkImage;
  /** A gallery background's share path: saved as is, never uploaded. */
  galleryUrl: string | null;
}

type Category = 'farben' | 'vorlagen' | 'deine';

const CATEGORIES: { value: Category; label: string; short: string; disabled: boolean }[] = [
  { value: 'farben', label: 'Farben', short: 'Farben', disabled: false },
  { value: 'vorlagen', label: 'Vorlagen', short: 'Vorlagen', disabled: false },
  { value: 'deine', label: 'Deine', short: 'Deine', disabled: false },
];

const SWATCH = 44;
const TILE = PICKER_TILE;

interface BackgroundPickerProps {
  isAustria: boolean;
  /** The bundled assets, for the preset thumbnails; empty while they load. */
  images: Partial<Record<ProfilbildAssetSrc, SkImage>>;
  selected: string;
  custom: CustomBackground | null;
  /** The freely chosen colour or gradient, once there is one. */
  freeBackground: FreeBackground | null;
  onSelect(id: string, background: MobileBackground): void;
  onCustom(custom: CustomBackground): void;
  onPickGallery(item: StudioAssetItem): void;
}

async function loadCustom(): Promise<CustomBackground | null> {
  const ref = await pickImageForEditor();
  if (!ref) return null;
  const image = Skia.Image.MakeImageFromEncoded(await Skia.Data.fromURI(ref.uri));
  if (!image) throw new Error('decode failed');
  return { uri: ref.uri, image, galleryUrl: null };
}

/**
 * Three tabs, like web: Farben (plain colours and gradients, each with a free
 * tile), Vorlagen, and Deine — the own photo, own and saved gallery
 * backgrounds, then upload and Entdecken.
 */
export function BackgroundPicker({
  isAustria,
  images,
  selected,
  custom,
  freeBackground,
  onSelect,
  onCustom,
  onPickGallery,
}: BackgroundPickerProps) {
  const theme = useTheme();
  const token = useShareToken();
  const colors = colorSwatches(isAustria);
  const gradients = gradientSwatches(isAustria);
  const presets = presetDesigns(isAustria);
  const palette = cdPalette(colors);
  const [tab, setTab] = useState<Category>(() =>
    presets.some((p) => p.id === selected)
      ? 'vorlagen'
      : selected === CUSTOM_ID
        ? 'deine'
        : 'farben'
  );
  const freeSelected = selected === FREE_BACKGROUND_ID ? freeBackground : null;

  const ring = (isSelected: boolean) => [
    styles.ring,
    { borderColor: isSelected ? theme.textGreen : 'transparent' },
  ];

  const upload = () => {
    loadCustom()
      .then((next) => {
        if (!next) return;
        onCustom(next);
        onSelect(CUSTOM_ID, { kind: 'image', image: next.image });
      })
      .catch(() => Alert.alert('Fehler', 'Das Bild konnte nicht geladen werden.'));
  };

  const selectFree = (bg: FreeBackground) => onSelect(FREE_BACKGROUND_ID, bg);

  const renderSwatch = (s: Swatch) => (
    <Pressable
      key={s.id}
      accessibilityRole="button"
      accessibilityLabel={s.label}
      accessibilityState={{ selected: selected === s.id }}
      onPress={() => onSelect(s.id, s.background)}
      style={[ring(selected === s.id), styles.swatchRing]}
    >
      <View style={[styles.swatch, { borderColor: theme.cardBorder }]}>
        <FlatFill background={s.background} />
      </View>
    </Pressable>
  );

  const renderPreset = (p: PresetDesign) => (
    <Pressable
      key={p.id}
      accessibilityRole="button"
      accessibilityLabel={p.label}
      accessibilityState={{ selected: selected === p.id }}
      onPress={() => onSelect(p.id, { kind: 'preset', designId: p.id })}
      style={[ring(selected === p.id), styles.tileRing]}
    >
      <View style={[styles.tile, { borderColor: theme.cardBorder }]}>
        <FlatFill background={p.base} />
        {p.overlays[0] ? <OverlayThumb design={p} images={images} /> : null}
      </View>
    </Pressable>
  );

  // A gallery background is a share path; it needs the bearer token to show.
  const customSource = custom?.galleryUrl
    ? isShareSrc(custom.galleryUrl) && token
      ? {
          uri: resolveChatUrl(custom.galleryUrl),
          headers: { Authorization: `Bearer ${token}` },
        }
      : null
    : custom
      ? { uri: custom.uri }
      : null;

  return (
    <View style={styles.root}>
      <SegmentedControl
        accessibilityLabel="Hintergrund-Art"
        value={tab}
        onChange={(v) => setTab(v as Category)}
        options={CATEGORIES}
      />
      {tab === 'farben' ? (
        <>
          <View accessibilityLabel="Vollfarben" style={styles.row}>
            {colors.map(renderSwatch)}
            <FreeColorTile
              mode="color"
              value={freeBackground?.kind === 'color' ? freeBackground : null}
              selected={freeSelected?.kind === 'color'}
              palette={palette}
              size={SWATCH}
              onChange={selectFree}
            />
          </View>
          <View accessibilityLabel="Verläufe" style={styles.row}>
            {gradients.map(renderSwatch)}
            <FreeColorTile
              mode="gradient"
              value={freeBackground?.kind === 'gradient' ? freeBackground : null}
              selected={freeSelected?.kind === 'gradient'}
              palette={palette}
              size={SWATCH}
              onChange={selectFree}
            />
          </View>
        </>
      ) : null}
      {tab === 'vorlagen' ? <View style={styles.row}>{presets.map(renderPreset)}</View> : null}
      {tab === 'deine' ? (
        <GalleryTiles
          kind="background"
          source="own"
          selectedSrc={selected === CUSTOM_ID ? (custom?.galleryUrl ?? '') : ''}
          onPick={onPickGallery}
          leadingSrc={custom?.galleryUrl ?? null}
          leading={
            custom ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Eigenes Hintergrundbild"
                accessibilityState={{ selected: selected === CUSTOM_ID }}
                onPress={() => onSelect(CUSTOM_ID, { kind: 'image', image: custom.image })}
                style={[ring(selected === CUSTOM_ID), styles.tileRing]}
              >
                <View style={[styles.tile, { borderColor: theme.cardBorder }]}>
                  {customSource ? (
                    <Image
                      source={customSource}
                      contentFit="cover"
                      style={StyleSheet.absoluteFill}
                    />
                  ) : null}
                </View>
              </Pressable>
            ) : null
          }
          trailing={
            <>
              <ActionTile label="Bild hochladen" onPress={upload}>
                <Ionicons name="cloud-upload-outline" size={22} color={theme.textSecondary} />
              </ActionTile>
              <ProfilbildDiscoverButton kind="background" onPick={onPickGallery} />
            </>
          }
        />
      ) : null}
    </View>
  );
}

function OverlayThumb({
  design,
  images,
}: {
  design: PresetDesign;
  images: Partial<Record<ProfilbildAssetSrc, SkImage>>;
}) {
  const o = design.overlays[0];
  const img = images[o.src];
  if (!img) return null;
  const width = o.width * TILE;
  const height = (width * img.height()) / img.width();
  return (
    <Image
      source={PROFILBILD_ASSETS[o.src]}
      contentFit="fill"
      style={{
        position: 'absolute',
        left: o.x * TILE - width / 2,
        top: o.y * TILE - height / 2,
        width,
        height,
        opacity: o.opacity,
      }}
    />
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.small },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xsmall },
  ring: { borderWidth: 2, padding: 2 },
  swatchRing: { borderRadius: borderRadius.full },
  swatch: {
    width: SWATCH,
    height: SWATCH,
    borderRadius: SWATCH / 2,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  tileRing: { borderRadius: borderRadius.large + 4 },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: borderRadius.large,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
});
