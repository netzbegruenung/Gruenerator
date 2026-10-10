import {
  COLOR_SWATCHES_AT,
  COLOR_SWATCHES_DE,
  GRADIENT_SWATCHES,
  presetDesigns,
  type FlatBackground,
  type PresetDesign,
  type ProfilbildAssetSrc,
  type Swatch,
} from '@gruenerator/shared/profilbild';
import { Skia, type SkImage } from '@shopify/react-native-skia';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { pickImageForEditor } from '../../services/imageEditMobile';
import { borderRadius, spacing } from '../../theme';
import { Button } from '../common/Button';
import { SegmentedControl } from '../common/SegmentedControl';

import { PROFILBILD_ASSETS } from './profilbildAssets';
import { swatchGradient, type MobileBackground } from './sceneModel';

export const CUSTOM_ID = 'eigenes-bild';

export interface CustomBackground {
  uri: string;
  image: SkImage;
}

type Category = 'farben' | 'verlaeufe' | 'vorlagen' | 'eigenes';

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'farben', label: 'Vollfarben' },
  { value: 'verlaeufe', label: 'Verlauf' },
  { value: 'vorlagen', label: 'Vorlagen' },
  { value: 'eigenes', label: 'Eigenes Bild' },
];

const SWATCH = 44;
const TILE = 64;

interface BackgroundPickerProps {
  isAustria: boolean;
  images: Record<ProfilbildAssetSrc, SkImage>;
  selected: string;
  custom: CustomBackground | null;
  onSelect(id: string, background: MobileBackground): void;
  onCustom(custom: CustomBackground): void;
}

async function loadCustom(): Promise<CustomBackground | null> {
  const ref = await pickImageForEditor();
  if (!ref) return null;
  const image = Skia.Image.MakeImageFromEncoded(await Skia.Data.fromURI(ref.uri));
  if (!image) throw new Error('decode failed');
  return { uri: ref.uri, image };
}

export function BackgroundPicker({
  isAustria,
  images,
  selected,
  custom,
  onSelect,
  onCustom,
}: BackgroundPickerProps) {
  const theme = useTheme();
  const colors = isAustria ? COLOR_SWATCHES_AT : COLOR_SWATCHES_DE;
  const presets = presetDesigns(isAustria);
  const [tab, setTab] = useState<Category>(() =>
    GRADIENT_SWATCHES.some((s) => s.id === selected)
      ? 'verlaeufe'
      : presets.some((p) => p.id === selected)
        ? 'vorlagen'
        : selected === CUSTOM_ID
          ? 'eigenes'
          : 'farben'
  );

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

  return (
    <View style={styles.root}>
      <SegmentedControl
        accessibilityLabel="Hintergrund-Art"
        value={tab}
        onChange={(v) => setTab(v as Category)}
        options={CATEGORIES.map((c) => ({ ...c, short: c.label, disabled: false }))}
      />
      <View style={styles.row}>
        {tab === 'farben' ? colors.map(renderSwatch) : null}
        {tab === 'verlaeufe' ? GRADIENT_SWATCHES.map(renderSwatch) : null}
        {tab === 'vorlagen' ? presets.map(renderPreset) : null}
        {tab === 'eigenes' ? (
          custom ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Eigenes Hintergrundbild"
                accessibilityState={{ selected: selected === CUSTOM_ID }}
                onPress={() => onSelect(CUSTOM_ID, { kind: 'image', image: custom.image })}
                style={[ring(selected === CUSTOM_ID), styles.tileRing]}
              >
                <Image
                  source={{ uri: custom.uri }}
                  contentFit="cover"
                  style={[styles.tile, { borderColor: theme.cardBorder }]}
                />
              </Pressable>
              <Button variant="outline" onPress={upload}>
                Anderes Bild wählen
              </Button>
            </>
          ) : (
            <Button variant="outline" onPress={upload}>
              Bild hochladen
            </Button>
          )
        ) : null}
      </View>
    </View>
  );
}

function FlatFill({ background }: { background: FlatBackground }) {
  if (background.kind === 'color') {
    return <View style={[StyleSheet.absoluteFill, { backgroundColor: background.color }]} />;
  }
  const g = swatchGradient(background);
  return (
    <LinearGradient
      colors={g.colors}
      locations={g.locations}
      start={g.start}
      end={g.end}
      style={StyleSheet.absoluteFill}
    />
  );
}

function OverlayThumb({
  design,
  images,
}: {
  design: PresetDesign;
  images: Record<ProfilbildAssetSrc, SkImage>;
}) {
  const o = design.overlays[0];
  const img = images[o.src];
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
