import {
  STICKER_SHADOW,
  stickerSwatches,
  swatchColor,
  type StickerEffects,
  type StickerLocale,
} from '@gruenerator/shared/stickers';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { type SkImage } from '@shopify/react-native-skia';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../../hooks/useTheme';
import { CutoutError, cutoutFromRef } from '../../../services/backgroundRemoval';
import {
  pickImageForEditor,
  takePhotoForEditor,
  type BevImageRef,
} from '../../../services/imageEditMobile';
import { borderRadius, colors, spacing, typography } from '../../../theme';
import { Button } from '../../common/Button';
import { SegmentedControl } from '../../common/SegmentedControl';

import { isStickerFile, OUTLINE_PRESETS, type OutlinePreset } from './creatorModel';
import {
  Hint,
  StickerPreview,
  SwatchRow,
  SwitchRow,
  usePreviewSize,
  type StickerDraft,
} from './creatorParts';
import {
  decodeImage,
  motifFromImage,
  renderImageSticker,
  StickerImageError,
} from './stickerRender';

export type ImageStickerMode = 'upload' | 'cutout';

const RENDER_DELAY_MS = 120;
const PROCESS_ERROR = 'Das Bild konnte nicht verarbeitet werden.';
const CUTOUT_ERROR = 'Freistellen fehlgeschlagen. Bitte erneut versuchen.';
const NOT_STICKER_FILE =
  'Bitte wähle ein PNG oder WebP. Für ein Foto nimm „Foto freistellen“ – da stellen wir dein Motiv frei.';

const titleFromName = (name: string | null | undefined) => (name ?? '').replace(/\.[^.]+$/, '');
const message = (err: unknown, fallback: string) =>
  err instanceof StickerImageError || err instanceof CutoutError ? err.message : fallback;

type Status =
  | { kind: 'idle' }
  | { kind: 'working'; source: BevImageRef }
  | { kind: 'error'; message: string; source: BevImageRef | null };

async function pickStickerFile() {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
    // Keep the original PNG/WebP; a transcoded JPEG would lose the transparency.
    preferredAssetRepresentationMode:
      ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
  });
  return result.canceled ? null : (result.assets[0] ?? null);
}

export function ImageStickerDesigner({
  mode,
  locale,
  onDraft,
}: {
  mode: ImageStickerMode;
  locale: StickerLocale;
  onDraft: (draft: StickerDraft | null) => void;
}) {
  const theme = useTheme();
  const previewSize = usePreviewSize();
  const swatches = stickerSwatches(locale);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [title, setTitle] = useState('');
  const [motif, setMotif] = useState<SkImage | null>(null);
  const [opaque, setOpaque] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [outlineOn, setOutlineOn] = useState(mode === 'cutout');
  const [outlinePreset, setOutlinePreset] = useState<OutlinePreset>('mittel');
  const [outlineColor, setOutlineColor] = useState(() => swatchColor(swatches, 'weiss'));
  const [shadowOn, setShadowOn] = useState(false);
  const [preview, setPreview] = useState<SkImage | null>(null);
  // Bumped per picked image, so a slow cut-out cannot land after „Anderes Bild".
  const run = useRef(0);

  const adopt = async (uri: string, id: number) => {
    const loaded = motifFromImage(await decodeImage(uri));
    if (id !== run.current) return;
    setOpaque(!loaded.transparent);
    setMotif(loaded.motif);
    setStatus({ kind: 'idle' });
  };

  const cutOut = (source: BevImageRef) => {
    const id = ++run.current;
    setStatus({ kind: 'working', source });
    cutoutFromRef(source)
      .then((uri) => adopt(uri, id))
      .catch((err: unknown) => {
        if (id === run.current)
          setStatus({ kind: 'error', message: message(err, CUTOUT_ERROR), source });
      });
  };

  const pickPhoto = (pick: () => Promise<BevImageRef | null>) => {
    pick()
      .then((ref) => {
        if (!ref) return;
        setTitle('');
        cutOut(ref);
      })
      .catch(() => setStatus({ kind: 'error', message: PROCESS_ERROR, source: null }));
  };

  const pickFile = () => {
    pickStickerFile()
      .then((asset) => {
        if (!asset) return;
        if (!isStickerFile(asset)) {
          setStatus({ kind: 'error', message: NOT_STICKER_FILE, source: null });
          return;
        }
        const id = ++run.current;
        setTitle(titleFromName(asset.fileName));
        return adopt(asset.uri, id);
      })
      .catch((err: unknown) =>
        setStatus({ kind: 'error', message: message(err, PROCESS_ERROR), source: null })
      );
  };

  const outlineWidth = OUTLINE_PRESETS.find((p) => p.value === outlinePreset)?.width ?? 24;
  useEffect(() => {
    if (!motif) return;
    const effects: StickerEffects = {
      outline: outlineOn ? { width: outlineWidth, color: outlineColor } : null,
      shadow: shadowOn ? STICKER_SHADOW : null,
    };
    const timer = setTimeout(() => {
      try {
        const image = renderImageSticker(motif, effects);
        setRenderError(null);
        setPreview(image);
        onDraft({ image, suggestedTitle: title });
      } catch (err) {
        setRenderError(message(err, PROCESS_ERROR));
        onDraft(null);
      }
    }, RENDER_DELAY_MS);
    return () => clearTimeout(timer);
  }, [motif, outlineOn, outlineWidth, outlineColor, shadowOn, title, onDraft]);

  const startOver = () => {
    run.current++;
    setStatus({ kind: 'idle' });
    setMotif(null);
    setPreview(null);
    setOpaque(false);
    setRenderError(null);
    onDraft(null);
  };

  if (!motif) {
    if (status.kind === 'working') {
      return (
        <View style={[styles.working, { width: previewSize, height: previewSize }]}>
          <Image source={{ uri: status.source.uri }} contentFit="cover" style={styles.fill} />
          <View style={[styles.fill, styles.dim]} />
          <ActivityIndicator size="large" color={colors.white} />
          <Text style={styles.workingText}>Hintergrund wird entfernt …</Text>
        </View>
      );
    }
    const source = status.kind === 'error' ? status.source : null;
    return (
      <View style={styles.pick}>
        <Ionicons
          name={mode === 'cutout' ? 'cut-outline' : 'image-outline'}
          size={56}
          color={theme.textGreen}
        />
        <Hint>
          {mode === 'cutout'
            ? 'Am besten ein Foto mit klarem Motiv – wir stellen es für dich frei.'
            : 'Ein PNG oder WebP mit transparentem Hintergrund.'}
        </Hint>
        {status.kind === 'error' ? (
          <Text accessibilityRole="alert" style={[styles.error, { color: colors.error[500] }]}>
            {status.message}
          </Text>
        ) : null}
        <View style={styles.buttons}>
          {source ? <Button onPress={() => cutOut(source)}>Erneut versuchen</Button> : null}
          {mode === 'cutout' ? (
            <>
              <Button
                variant={source ? 'outline' : 'primary'}
                onPress={() => pickPhoto(pickImageForEditor)}
              >
                {source ? 'Anderes Foto' : 'Foto wählen'}
              </Button>
              <Button variant="outline" onPress={() => pickPhoto(takePhotoForEditor)}>
                Foto aufnehmen
              </Button>
            </>
          ) : (
            <Button onPress={pickFile}>Bild wählen</Button>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StickerPreview image={preview} size={previewSize} label="Vorschau deines Stickers" />
      {opaque ? (
        <View style={[styles.note, { backgroundColor: theme.surface }]}>
          <Hint>
            Dein Bild hat keinen transparenten Hintergrund. Für ein freigestelltes Motiv nimm „Foto
            freistellen“.
          </Hint>
        </View>
      ) : null}
      <SwitchRow label="Kontur" value={outlineOn} onChange={setOutlineOn}>
        <SegmentedControl
          accessibilityLabel="Stärke der Kontur"
          value={outlinePreset}
          onChange={(v) => setOutlinePreset(v as OutlinePreset)}
          options={OUTLINE_PRESETS.map((p) => ({
            value: p.value,
            label: p.label,
            short: p.label,
            disabled: false,
          }))}
        />
        <SwatchRow
          label="Farbe der Kontur"
          swatches={swatches}
          value={outlineColor}
          onChange={setOutlineColor}
        />
      </SwitchRow>
      <SwitchRow label="Schatten" value={shadowOn} onChange={setShadowOn} />
      {renderError ? (
        <Text accessibilityRole="alert" style={[styles.error, { color: colors.error[500] }]}>
          {renderError}
        </Text>
      ) : null}
      <Button variant="ghost" onPress={startOver}>
        {mode === 'cutout' ? 'Anderes Foto' : 'Anderes Bild'}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.medium },
  pick: { alignItems: 'center', gap: spacing.medium, paddingVertical: spacing.large },
  buttons: { width: '100%', maxWidth: 360, gap: spacing.small },
  working: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.medium,
    borderRadius: borderRadius.xlarge,
    overflow: 'hidden',
  },
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  dim: { backgroundColor: colors.black, opacity: 0.55 },
  workingText: { ...typography.bodyBold, color: colors.white },
  note: { borderRadius: borderRadius.large, padding: spacing.small },
  error: { ...typography.body, textAlign: 'center' },
});
