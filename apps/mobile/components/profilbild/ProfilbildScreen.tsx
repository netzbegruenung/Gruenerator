import {
  COLOR_SWATCHES_AT,
  COLOR_SWATCHES_DE,
  type ProfilbildSticker,
} from '@gruenerator/shared/profilbild';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { type SkImage } from '@shopify/react-native-skia';
import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useProfilbildCutout } from '../../hooks/profilbild/useProfilbildCutout';
import { useProfilbildImages } from '../../hooks/profilbild/useProfilbildImages';
import { useTheme } from '../../hooks/useTheme';
import {
  pickImageForEditor,
  takePhotoForEditor,
  type BevImageRef,
} from '../../services/imageEditMobile';
import { saveImageToGallery } from '../../services/imageStudio';
import { shareBase64Image } from '../../services/share';
import { borderRadius, colors, spacing, typography } from '../../theme';
import { Button } from '../common/Button';
import { SegmentedControl } from '../common/SegmentedControl';

import { BackgroundPicker, type CustomBackground } from './BackgroundPicker';
import { InstagramPreview, PreviewFrame, type PreviewVariant } from './PreviewFrame';
import { ProfilbildEditor } from './ProfilbildEditor';
import { exportProfilbildBase64 } from './ProfilbildScene';
import { initialModel, newSticker, type ProfilbildModel } from './sceneModel';
import { StickerPicker } from './StickerPicker';

const VARIANTS: { value: PreviewVariant; label: string }[] = [
  { value: 'rund', label: 'Rund' },
  { value: 'quadrat', label: 'Quadrat' },
  { value: 'instagram', label: 'Instagram' },
];

type Panel = 'hintergrund' | 'sticker';

const PANELS: { value: Panel; label: string }[] = [
  { value: 'hintergrund', label: 'Hintergrund' },
  { value: 'sticker', label: 'Sticker' },
];

const segments = <T extends string>(list: { value: T; label: string }[]) =>
  list.map((o) => ({ ...o, short: o.label, disabled: false }));

let stickerCounter = 0;

export function ProfilbildScreen({ isAustria }: { isAustria: boolean }) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const viewSize = Math.min(width - spacing.xlarge, 360);
  const { state, start, retry, reset } = useProfilbildCutout();
  const assets = useProfilbildImages();
  const firstSwatch = (isAustria ? COLOR_SWATCHES_AT : COLOR_SWATCHES_DE)[0];

  const person = state.status === 'ready' ? state.person : null;
  const [seeded, setSeeded] = useState<SkImage | null>(null);
  const [model, setModel] = useState<ProfilbildModel | null>(null);
  const [backgroundId, setBackgroundId] = useState(firstSwatch.id);
  const [custom, setCustom] = useState<CustomBackground | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [variant, setVariant] = useState<PreviewVariant>('rund');
  const [panel, setPanel] = useState<Panel>('hintergrund');
  const [busy, setBusy] = useState<'save' | 'share' | null>(null);
  const busyRef = useRef(false);

  if (person !== seeded) {
    setSeeded(person);
    setModel(
      person ? initialModel({ width: person.width(), height: person.height() }, isAustria) : null
    );
    setBackgroundId(firstSwatch.id);
    setSelected(null);
  }

  const pick = (source: () => Promise<BevImageRef | null>) => {
    source()
      .then((ref) => {
        if (ref) start(ref);
      })
      .catch(() => Alert.alert('Fehler', 'Das Foto konnte nicht geladen werden.'));
  };

  if (state.status === 'idle') {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <Ionicons name="person-circle-outline" size={64} color={theme.textGreen} />
        <View style={styles.buttons}>
          <Button onPress={() => pick(pickImageForEditor)}>Foto wählen</Button>
          <Button variant="outline" onPress={() => pick(takePhotoForEditor)}>
            Foto aufnehmen
          </Button>
        </View>
      </View>
    );
  }

  if (state.status === 'working') {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <View style={[styles.working, { width: viewSize, height: viewSize }]}>
          <Image source={{ uri: state.source.uri }} contentFit="cover" style={styles.fill} />
          <View style={[styles.fill, styles.dim]} />
          <ActivityIndicator size="large" color={colors.white} />
          <Text style={styles.workingText}>Person wird freigestellt…</Text>
        </View>
      </View>
    );
  }

  if (state.status === 'error') {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <Text accessibilityRole="alert" style={[styles.error, { color: colors.error[500] }]}>
          {state.message}
        </Text>
        <View style={styles.buttons}>
          <Button onPress={retry}>Erneut versuchen</Button>
          <Button variant="outline" onPress={reset}>
            Anderes Foto
          </Button>
        </View>
      </View>
    );
  }

  if (assets.status === 'error') {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <Text accessibilityRole="alert" style={[styles.error, { color: colors.error[500] }]}>
          Vorlagen und Sticker konnten nicht geladen werden.
        </Text>
        <View style={styles.buttons}>
          <Button onPress={assets.reload}>Erneut versuchen</Button>
        </View>
      </View>
    );
  }

  if (assets.status === 'loading' || !model) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.textGreen} />
      </View>
    );
  }

  const { images } = assets;
  const scene = { model, person: state.person, images, isAustria };

  const addSticker = (sticker: ProfilbildSticker) => {
    const image = images[sticker.src];
    const uid = `${sticker.id}-${++stickerCounter}`;
    const next = newSticker(sticker, { width: image.width(), height: image.height() }, uid);
    setModel({ ...model, stickers: [...model.stickers, next] });
    setSelected(uid);
  };

  const run = async (kind: 'save' | 'share') => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(kind);
    try {
      const b64 = await exportProfilbildBase64(scene);
      if (kind === 'save') await saveImageToGallery(b64, 'profilbild.png');
      else await shareBase64Image(b64, 'Profilbild teilen', { uti: 'public.png' });
    } catch {
      Alert.alert(
        'Fehler',
        kind === 'save'
          ? 'Das Bild konnte nicht gespeichert werden.'
          : 'Das Bild konnte nicht geteilt werden.'
      );
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  return (
    <SafeAreaView edges={['bottom']} style={[styles.root, { backgroundColor: theme.background }]}>
      <View style={styles.stage}>
        <PreviewFrame variant={variant} viewSize={viewSize}>
          <ProfilbildEditor
            {...scene}
            onChange={setModel}
            viewSize={viewSize}
            selected={selected}
            onSelect={setSelected}
          />
        </PreviewFrame>
      </View>
      <ScrollView contentContainerStyle={styles.controls} keyboardShouldPersistTaps="handled">
        <SegmentedControl
          accessibilityLabel="Vorschau"
          value={variant}
          onChange={(v) => setVariant(v as PreviewVariant)}
          options={segments(VARIANTS)}
        />
        {variant === 'instagram' ? <InstagramPreview {...scene} /> : null}
        <SegmentedControl
          accessibilityLabel="Bearbeiten"
          value={panel}
          onChange={(v) => setPanel(v as Panel)}
          options={segments(PANELS)}
        />
        {panel === 'hintergrund' ? (
          <BackgroundPicker
            isAustria={isAustria}
            images={images}
            selected={backgroundId}
            custom={custom}
            onCustom={setCustom}
            onSelect={(id, background) => {
              setBackgroundId(id);
              setModel({ ...model, background });
            }}
          />
        ) : (
          <StickerPicker onAdd={addSticker} />
        )}
        <Button variant="ghost" onPress={reset}>
          Anderes Foto
        </Button>
      </ScrollView>
      <View style={[styles.actions, { borderTopColor: theme.border }]}>
        <Button
          style={styles.action}
          onPress={() => void run('save')}
          loading={busy === 'save'}
          disabled={busy !== null}
        >
          Speichern
        </Button>
        <Button
          variant="outline"
          style={styles.action}
          onPress={() => void run('share')}
          loading={busy === 'share'}
          disabled={busy !== null}
        >
          Teilen
        </Button>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.large,
    padding: spacing.medium,
  },
  buttons: { width: '100%', maxWidth: 360, gap: spacing.small },
  working: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.medium,
    borderRadius: borderRadius.xlarge,
    overflow: 'hidden',
  },
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  dim: { backgroundColor: colors.black, opacity: 0.55 },
  workingText: { ...typography.bodyBold, color: colors.white },
  error: { ...typography.body, textAlign: 'center' },
  stage: { alignItems: 'center', paddingTop: spacing.medium },
  controls: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    gap: spacing.medium,
    padding: spacing.medium,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.small,
    paddingHorizontal: spacing.medium,
    paddingTop: spacing.small,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  action: { flex: 1 },
});
