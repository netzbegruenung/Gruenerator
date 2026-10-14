import {
  COLOR_SWATCHES_AT,
  COLOR_SWATCHES_DE,
  type ProfilbildSticker,
} from '@gruenerator/shared/profilbild';
import { galleryTarget, isShareSrc, type GalleryAsset } from '@gruenerator/shared/stickers';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { type SkImage } from '@shopify/react-native-skia';
import { Image } from 'expo-image';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
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

import { useProfilbildAutosave } from '../../hooks/profilbild/useProfilbildAutosave';
import { useProfilbildCutout } from '../../hooks/profilbild/useProfilbildCutout';
import { useProfilbildImages } from '../../hooks/profilbild/useProfilbildImages';
import {
  clearShareImages,
  loadProfilbildReopen,
  loadShareImage,
  useProfilbildShare,
  type ProfilbildReopen,
} from '../../hooks/profilbild/useProfilbildShare';
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

import { BackgroundPicker, CUSTOM_ID, type CustomBackground } from './BackgroundPicker';
import { galleryStickerSource } from './galleryModel';
import { InstagramPreview, PreviewFrame, type PreviewVariant } from './PreviewFrame';
import { ProfilbildEditor } from './ProfilbildEditor';
import { nextStickerUid } from './profilbildGestures';
import { exportProfilbildBase64 } from './ProfilbildScene';
import {
  initialModel,
  newSticker,
  type ProfilbildModel,
  type SceneImages,
  type StickerSource,
} from './sceneModel';
import { StickerPicker } from './StickerPicker';

const VARIANTS: { value: PreviewVariant; label: string }[] = [
  { value: 'rund', label: 'Rund' },
  { value: 'quadrat', label: 'Quadrat' },
  { value: 'instagram', label: 'Instagram' },
];

const SAVE_STATUS = {
  idle: '',
  saving: 'Wird gespeichert …',
  saved: 'Unter „Zuletzt“ gespeichert',
  error: 'Nicht gespeichert – die nächste Änderung versucht es erneut.',
};

type Panel = 'hintergrund' | 'sticker';

const PANELS: { value: Panel; label: string }[] = [
  { value: 'hintergrund', label: 'Hintergrund' },
  { value: 'sticker', label: 'Sticker' },
];

const segments = <T extends string>(list: { value: T; label: string }[]) =>
  list.map((o) => ({ ...o, short: o.label, disabled: false }));

async function exportAndDeliver(
  kind: 'save' | 'share',
  scene: Parameters<typeof exportProfilbildBase64>[0],
  archive: (b64: string) => Promise<unknown>
): Promise<void> {
  const b64 = await exportProfilbildBase64(scene);
  archive(b64).catch(() =>
    Alert.alert('Hinweis', 'Unter „Zuletzt“ konnte das Profilbild nicht abgelegt werden.')
  );
  if (kind === 'save') await saveImageToGallery(b64, 'profilbild.png');
  else await shareBase64Image(b64, 'Profilbild teilen');
}

export function ProfilbildScreen({
  isAustria,
  shareToken,
  galleryAsset,
}: {
  isAustria: boolean;
  /** A saved Profilbild to reopen with its editor state. */
  shareToken: string | null;
  /** A gallery sticker or background to apply once the photo is in. */
  galleryAsset: GalleryAsset | null;
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const viewSize = Math.min(width - spacing.xlarge, 360);
  const { state, start, retry, reset, adopt } = useProfilbildCutout();
  const { save, begin } = useProfilbildShare();
  const [reopen, setReopen] = useState<ProfilbildReopen | null>(null);
  const [reopenStatus, setReopenStatus] = useState<'loading' | 'error' | null>(
    shareToken ? 'loading' : null
  );
  const assets = useProfilbildImages();
  const firstSwatch = (isAustria ? COLOR_SWATCHES_AT : COLOR_SWATCHES_DE)[0];

  const person = state.status === 'ready' ? state.person : null;
  const [seeded, setSeeded] = useState<SkImage | null>(null);
  const [model, setModel] = useState<ProfilbildModel | null>(null);
  const [backgroundId, setBackgroundId] = useState(firstSwatch.id);
  const [custom, setCustom] = useState<CustomBackground | null>(null);
  const [gallery, setGallery] = useState<Record<string, SkImage>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [variant, setVariant] = useState<PreviewVariant>('rund');
  const [panel, setPanel] = useState<Panel>('hintergrund');
  const [busy, setBusy] = useState<'save' | 'share' | null>(null);
  const busyRef = useRef(false);
  // Bumped per background choice, so a slow gallery load cannot override a later pick.
  const backgroundRequest = useRef(0);
  // The photo being edited, so a sticker still loading cannot land on the next one.
  const currentPerson = useRef<SkImage | null>(null);

  useEffect(() => clearShareImages, []);
  useEffect(() => {
    currentPerson.current = person;
  }, [person]);

  useEffect(() => {
    if (!shareToken) return;
    let alive = true;
    loadProfilbildReopen(shareToken, isAustria)
      .then((loaded) => {
        if (!alive) return;
        begin(loaded);
        setReopen(loaded);
        setCustom(loaded.custom);
        setGallery((g) => ({ ...g, ...loaded.gallery }));
        adopt(
          { uri: loaded.personUri, width: loaded.person.width(), height: loaded.person.height() },
          loaded.person
        );
        setReopenStatus(null);
      })
      .catch(() => {
        if (alive) setReopenStatus('error');
      });
    return () => {
      alive = false;
    };
  }, [shareToken, isAustria, adopt, begin]);

  const ready = !!person && !!model && assets.status === 'ready';
  const autosave = useProfilbildAutosave(
    person,
    ready ? { model, backgroundId, custom } : null,
    async (snapshot) => {
      if (!person || assets.status !== 'ready') return;
      const b64 = await exportProfilbildBase64({
        model: snapshot.model,
        person,
        images: { ...assets.images, ...gallery },
        isAustria,
      });
      await save(b64, person, snapshot);
    },
    !!reopen && person === reopen.person
  );

  if (person !== seeded) {
    setSeeded(person);
    const restored = reopen && person === reopen.person ? reopen : null;
    setModel(
      restored
        ? restored.model
        : person
          ? initialModel({ width: person.width(), height: person.height() }, isAustria)
          : null
    );
    setBackgroundId(restored ? restored.backgroundId : firstSwatch.id);
    setSelected(null);
  }

  const pick = (source: () => Promise<BevImageRef | null>) => {
    source()
      .then((ref) => {
        if (!ref) return;
        begin(null);
        start(ref);
      })
      .catch(() => Alert.alert('Fehler', 'Das Foto konnte nicht geladen werden.'));
  };

  const placeSticker = (sticker: StickerSource, image: SkImage) => {
    const uid = nextStickerUid(sticker.id);
    const next = newSticker(sticker, { width: image.width(), height: image.height() }, uid);
    setModel((m) => (m ? { ...m, stickers: [...m.stickers, next] } : m));
    setSelected(uid);
  };

  const addGallerySticker = (item: GalleryAsset) => {
    if (!isShareSrc(item.src)) {
      Alert.alert('Fehler', 'Dieser Sticker kann nicht verwendet werden.');
      return;
    }
    const forPerson = person;
    loadShareImage(item.src)
      .then((image) => {
        if (forPerson !== currentPerson.current) return;
        setGallery((g) => ({ ...g, [item.src]: image }));
        placeSticker(galleryStickerSource(item), image);
      })
      .catch(() => {
        if (forPerson === currentPerson.current)
          Alert.alert('Fehler', 'Der Sticker konnte nicht geladen werden.');
      });
  };

  const pickGalleryBackground = (item: GalleryAsset) => {
    if (!isShareSrc(item.src)) {
      Alert.alert('Fehler', 'Dieser Hintergrund kann nicht verwendet werden.');
      return;
    }
    const request = ++backgroundRequest.current;
    loadShareImage(item.src)
      .then((image) => {
        if (request !== backgroundRequest.current) return;
        setCustom({ uri: item.src, image, galleryUrl: item.src });
        setBackgroundId(CUSTOM_ID);
        setModel((m) => (m ? { ...m, background: { kind: 'image', image } } : m));
      })
      .catch(() => {
        if (request === backgroundRequest.current)
          Alert.alert('Fehler', 'Der Hintergrund konnte nicht geladen werden.');
      });
  };

  // A gallery deep link waits here until the photo (and a reopened state) is in;
  // a later link (back from the sticker creator) queues its asset again.
  const [pendingAsset, setPendingAsset] = useState(galleryAsset);
  const [linkedAssetId, setLinkedAssetId] = useState(galleryAsset?.id ?? null);
  const [landingAsset, setLandingAsset] = useState<GalleryAsset | null>(null);
  if ((galleryAsset?.id ?? null) !== linkedAssetId) {
    setLinkedAssetId(galleryAsset?.id ?? null);
    if (galleryAsset) setPendingAsset(galleryAsset);
  }
  if (pendingAsset && ready) {
    setPendingAsset(null);
    setLandingAsset(pendingAsset);
    if (pendingAsset.kind === 'sticker') setPanel('sticker');
  }

  const applyGalleryAsset = useEffectEvent((asset: GalleryAsset) => {
    if (asset.kind === 'background') pickGalleryBackground(asset);
    else addGallerySticker(asset);
  });

  useEffect(() => {
    if (landingAsset) applyGalleryAsset(landingAsset);
  }, [landingAsset]);

  if (reopenStatus === 'loading') {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.textGreen} />
        <Text style={[styles.error, { color: theme.text }]}>Profilbild wird geladen…</Text>
      </View>
    );
  }

  if (reopenStatus === 'error') {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <Text accessibilityRole="alert" style={[styles.error, { color: colors.error[500] }]}>
          Dieses Profilbild konnte nicht geöffnet werden.
        </Text>
        <View style={styles.buttons}>
          <Button onPress={() => setReopenStatus(null)}>Neues Profilbild</Button>
        </View>
      </View>
    );
  }

  if (state.status === 'idle') {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <Ionicons name="person-circle-outline" size={64} color={theme.textGreen} />
        {pendingAsset && !shareToken ? (
          <Text style={[styles.error, { color: theme.text }]}>
            {`Wähle zuerst ein Foto – dann setzen wir ${galleryTarget(pendingAsset)} ein.`}
          </Text>
        ) : null}
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

  const images: SceneImages = { ...assets.images, ...gallery };
  const scene = { model, person: state.person, images, isAustria };

  const addSticker = (sticker: ProfilbildSticker) => placeSticker(sticker, images[sticker.src]);

  const run = async (kind: 'save' | 'share') => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(kind);
    await exportAndDeliver(kind, scene, (b64) =>
      save(b64, state.person, { model, backgroundId, custom }).then(autosave.noteSaved)
    )
      .catch(() => {
        Alert.alert(
          'Fehler',
          kind === 'save'
            ? 'Das Bild konnte nicht gespeichert werden.'
            : 'Das Bild konnte nicht geteilt werden.'
        );
      })
      .finally(() => {
        busyRef.current = false;
        setBusy(null);
      });
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
            onPickGallery={pickGalleryBackground}
            onSelect={(id, background) => {
              backgroundRequest.current += 1;
              setBackgroundId(id);
              setModel({ ...model, background });
            }}
          />
        ) : (
          <StickerPicker
            isAustria={isAustria}
            onAdd={addSticker}
            onAddGallery={addGallerySticker}
          />
        )}
        <Button
          variant="ghost"
          onPress={() => {
            begin(null);
            reset();
          }}
        >
          Anderes Foto
        </Button>
      </ScrollView>
      <Text
        accessibilityLiveRegion="polite"
        style={[styles.saveStatus, { color: theme.textSecondary }]}
      >
        {SAVE_STATUS[autosave.state]}
      </Text>
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
  saveStatus: { ...typography.caption, textAlign: 'center', minHeight: 18 },
  actions: {
    flexDirection: 'row',
    gap: spacing.small,
    paddingHorizontal: spacing.medium,
    paddingTop: spacing.small,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  action: { flex: 1 },
});
