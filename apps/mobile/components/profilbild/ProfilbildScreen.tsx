import {
  colorSwatches,
  FREE_BACKGROUND_ID,
  type FreeBackground,
  type ProfilbildSticker,
} from '@gruenerator/shared/profilbild';
import { galleryTarget, isShareSrc, type GalleryAsset } from '@gruenerator/shared/stickers';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { type SkImage } from '@shopify/react-native-skia';
import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
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
  prepareUploadFromUri,
  takePhotoForEditor,
  type BevImageRef,
} from '../../services/imageEditMobile';
import { saveImageToGallery } from '../../services/imageStudio';
import { shareBase64Image } from '../../services/share';
import { borderRadius, colors, spacing, typography } from '../../theme';
import { Button } from '../common/Button';
import { SkeletonBar, SkeletonGroup } from '../common/Skeleton';

import { BackgroundPicker, CUSTOM_ID, type CustomBackground } from './BackgroundPicker';
import { galleryStickerSource } from './galleryModel';
import { PhotoStage } from './PhotoStage';
import { InstagramPeek, PreviewFrame } from './PreviewFrame';
import { ProfilbildEditor } from './ProfilbildEditor';
import { nextStickerUid } from './profilbildGestures';
import { exportProfilbildBase64 } from './ProfilbildScene';
import { ProfilbildToolbar, ToolSheet, type ProfilbildTool } from './ProfilbildToolbar';
import { RecentPhotos } from './RecentPhotos';
import { RecentProfilbilder } from './RecentProfilbilder';
import {
  initialModel,
  newSticker,
  type MobileBackground,
  type ProfilbildModel,
  type SceneImages,
  type StickerSource,
} from './sceneModel';
import { StickerPicker } from './StickerPicker';

// The autosave as a badge on the stage; „Zuletzt" is where it lands.
const SAVE_STATUS = {
  idle: null,
  saving: { text: 'Speichert …', label: 'Wird unter „Zuletzt“ gespeichert' },
  saved: { text: '✓ Gespeichert', label: 'Unter „Zuletzt“ gespeichert' },
  error: {
    text: 'Nicht gespeichert',
    label: 'Nicht gespeichert – die nächste Änderung versucht es erneut.',
  },
};

/** A tool sheet takes at most half the screen; the stage keeps the rest above it. */
const STAGE_HEIGHT_SHARE = 0.42;

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
  const { width, height } = useWindowDimensions();
  const viewSize = Math.min(width - spacing.xlarge, 360, Math.round(height * STAGE_HEIGHT_SHARE));
  const { state, start, retry, reset, adopt } = useProfilbildCutout();
  const { save, begin } = useProfilbildShare();
  const [reopen, setReopen] = useState<ProfilbildReopen | null>(null);
  const [reopenStatus, setReopenStatus] = useState<'loading' | 'error' | null>(
    shareToken ? 'loading' : null
  );
  const assets = useProfilbildImages();
  const firstSwatch = colorSwatches(isAustria)[0];

  const person = state.status === 'ready' ? state.person : null;
  const [seeded, setSeeded] = useState<SkImage | null>(null);
  const [model, setModel] = useState<ProfilbildModel | null>(null);
  // The chosen background lives outside the model too: it is picked before the photo is in.
  const [backgroundId, setBackgroundId] = useState(firstSwatch.id);
  const [background, setBackground] = useState<MobileBackground>(firstSwatch.background);
  const [freeBackground, setFreeBackground] = useState<FreeBackground | null>(null);
  const [custom, setCustom] = useState<CustomBackground | null>(null);
  const [gallery, setGallery] = useState<Record<string, SkImage>>({});
  const [selected, setSelected] = useState<string | null>(null);
  // The Instagram preview: held on the stage, or opened from the hint until tapped away.
  const [peek, setPeek] = useState<'hold' | 'sticky' | null>(null);
  const [tool, setTool] = useState<ProfilbildTool | null>(null);
  // A sheet is a Modal: left open it would lie over the next screen (Sticker erstellen, Entdecken).
  useFocusEffect(useCallback(() => () => setTool(null), []));
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
    if (restored) {
      const bg = restored.model.background;
      setModel(restored.model);
      setBackgroundId(restored.backgroundId);
      setBackground(bg);
      if (
        restored.backgroundId === FREE_BACKGROUND_ID &&
        (bg.kind === 'color' || bg.kind === 'gradient')
      )
        setFreeBackground(bg);
    } else {
      // A new photo keeps the background chosen before it.
      setModel(
        person
          ? {
              ...initialModel({ width: person.width(), height: person.height() }, isAustria),
              background,
            }
          : null
      );
    }
    setSelected(null);
  }

  const chooseBackground = (id: string, bg: MobileBackground) => {
    setBackgroundId(id);
    setBackground(bg);
    if (id === FREE_BACKGROUND_ID && (bg.kind === 'color' || bg.kind === 'gradient'))
      setFreeBackground(bg);
    setModel((m) => (m ? { ...m, background: bg } : m));
  };

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
        chooseBackground(CUSTOM_ID, { kind: 'image', image });
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
  }

  const applyGalleryAsset = useEffectEvent((asset: GalleryAsset) => {
    if (asset.kind === 'background') pickGalleryBackground(asset);
    else addGallerySticker(asset);
  });

  useEffect(() => {
    if (landingAsset) applyGalleryAsset(landingAsset);
  }, [landingAsset]);

  // A reopened Profilbild lands in the editor's layout: stage, hint, tools.
  if (reopenStatus === 'loading') {
    return (
      <SafeAreaView
        edges={['bottom']}
        accessible
        accessibilityLabel="Profilbild wird geladen"
        style={[styles.root, { backgroundColor: theme.background }]}
      >
        <SkeletonGroup style={styles.main}>
          <SkeletonBar width={viewSize} height={viewSize} radius={0} />
          <SkeletonBar width={viewSize * 0.6} height={16} />
        </SkeletonGroup>
        <SkeletonGroup style={[styles.toolbarSkeleton, { borderTopColor: theme.border }]}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.toolSkeleton}>
              <SkeletonBar width={44} height={44} radius={borderRadius.large} />
              <SkeletonBar width={56} height={10} />
            </View>
          ))}
        </SkeletonGroup>
      </SafeAreaView>
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

  const pickerImages = { ...(assets.status === 'ready' ? assets.images : {}), ...gallery };
  const scene =
    state.status === 'ready' && model && assets.status === 'ready'
      ? {
          model,
          person: state.person,
          images: { ...assets.images, ...gallery } as SceneImages,
          isAustria,
        }
      : null;

  const addSticker = (sticker: ProfilbildSticker) => {
    if (scene) placeSticker(sticker, scene.images[sticker.src]);
  };

  const run = async (kind: 'save' | 'share') => {
    if (busyRef.current || !scene) return;
    busyRef.current = true;
    setBusy(kind);
    await exportAndDeliver(kind, scene, (b64) =>
      save(b64, scene.person, { model: scene.model, backgroundId, custom }).then(autosave.noteSaved)
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

  const backgroundPicker = (
    <BackgroundPicker
      isAustria={isAustria}
      images={pickerImages}
      selected={backgroundId}
      custom={custom}
      freeBackground={freeBackground}
      onCustom={setCustom}
      onPickGallery={pickGalleryBackground}
      onSelect={(id, bg) => {
        backgroundRequest.current += 1;
        chooseBackground(id, bg);
      }}
    />
  );

  const closeThen = (action: () => void) => () => {
    setTool(null);
    action();
  };
  const status = scene ? SAVE_STATUS[autosave.state] : null;

  // The editor opens straight away: before a photo the stage is the upload zone,
  // and stickers, the photo tool and export wait for the photo. Every tool opens
  // a sheet low enough that its effect shows on the stage above it.
  return (
    <SafeAreaView edges={['bottom']} style={[styles.root, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{
          headerRight: () =>
            scene ? (
              <View style={styles.headerActions}>
                <HeaderAction
                  icon="share-social-outline"
                  label="Teilen"
                  busy={busy === 'share'}
                  disabled={busy !== null}
                  onPress={() => void run('share')}
                />
                <HeaderAction
                  icon="download-outline"
                  label="Speichern"
                  busy={busy === 'save'}
                  disabled={busy !== null}
                  onPress={() => void run('save')}
                />
              </View>
            ) : null,
        }}
      />
      <View style={styles.main}>
        <View>
          {scene ? (
            <PreviewFrame viewSize={viewSize}>
              <ProfilbildEditor
                {...scene}
                onChange={setModel}
                viewSize={viewSize}
                selected={selected}
                onSelect={setSelected}
                onPeek={(on) => setPeek((p) => (on ? 'hold' : p === 'hold' ? null : p))}
              />
            </PreviewFrame>
          ) : state.status === 'ready' ? (
            <SkeletonGroup>
              <SkeletonBar width={viewSize} height={viewSize} radius={0} />
            </SkeletonGroup>
          ) : (
            <PhotoStage
              size={viewSize}
              state={state}
              background={background}
              images={pickerImages}
              isAustria={isAustria}
              pendingHint={
                pendingAsset && !shareToken
                  ? `Wähle zuerst ein Foto – dann setzen wir ${galleryTarget(pendingAsset)} ein.`
                  : null
              }
              onRetry={retry}
              onReset={reset}
            />
          )}
          {status ? (
            <View
              accessible
              accessibilityLiveRegion="polite"
              accessibilityLabel={status.label}
              style={styles.badge}
            >
              <Text style={styles.badgeText}>{status.text}</Text>
            </View>
          ) : null}
        </View>
        {scene ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Instagram-Vorschau zeigen"
            accessibilityHint="Oder das Bild gedrückt halten"
            hitSlop={8}
            onPress={() => setPeek('sticky')}
            style={styles.hint}
          >
            <Ionicons name="logo-instagram" size={16} color={theme.textSecondary} />
            <Text style={[styles.hintText, { color: theme.textSecondary }]}>
              Gedrückt halten: Instagram-Vorschau
            </Text>
          </Pressable>
        ) : null}
        {!scene && state.status === 'idle' ? <RecentProfilbilder width={viewSize} /> : null}
        {!scene && state.status === 'idle' ? (
          <RecentPhotos
            width={viewSize}
            onPhoto={(uri) => pick(() => prepareUploadFromUri(uri))}
            onCamera={() => pick(takePhotoForEditor)}
            onLibrary={() => pick(pickImageForEditor)}
          />
        ) : null}
        {/* Over the stage area only: the header and the toolbar stay in place. */}
        {scene && peek === 'hold' ? (
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <InstagramPeek {...scene} />
          </View>
        ) : null}
        {scene && peek === 'sticky' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Instagram-Vorschau schließen"
            onPress={() => setPeek(null)}
            style={StyleSheet.absoluteFill}
          >
            <InstagramPeek {...scene} />
          </Pressable>
        ) : null}
      </View>
      <ProfilbildToolbar
        active={tool}
        disabled={scene ? [] : ['sticker', 'foto']}
        onOpen={(t) => setTool((open) => (open === t ? null : t))}
      />
      <ToolSheet title="Hintergrund" visible={tool === 'hintergrund'} onClose={() => setTool(null)}>
        {backgroundPicker}
      </ToolSheet>
      <ToolSheet title="Sticker" visible={tool === 'sticker'} onClose={() => setTool(null)}>
        <StickerPicker
          isAustria={isAustria}
          onAdd={(sticker) => closeThen(() => addSticker(sticker))()}
          onAddGallery={(item) => closeThen(() => addGallerySticker(item))()}
        />
      </ToolSheet>
      <ToolSheet title="Foto" visible={tool === 'foto'} onClose={() => setTool(null)}>
        <Button onPress={closeThen(() => pick(pickImageForEditor))}>Anderes Foto wählen</Button>
        <Button variant="outline" onPress={closeThen(() => pick(takePhotoForEditor))}>
          Foto aufnehmen
        </Button>
      </ToolSheet>
    </SafeAreaView>
  );
}

function HeaderAction({
  icon,
  label,
  busy,
  disabled,
  onPress,
}: {
  icon: 'share-social-outline' | 'download-outline';
  label: string;
  busy: boolean;
  disabled: boolean;
  onPress(): void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      style={styles.headerButton}
    >
      {busy ? (
        <ActivityIndicator size="small" color={theme.text} />
      ) : (
        <Ionicons name={icon} size={22} color={theme.text} />
      )}
    </Pressable>
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
  error: { ...typography.body, textAlign: 'center' },
  main: { flex: 1, alignItems: 'center', paddingTop: spacing.medium, gap: spacing.medium },
  hint: { flexDirection: 'row', alignItems: 'center', gap: spacing.xsmall, minHeight: 32 },
  hintText: { ...typography.caption },
  // Mirrors ProfilbildToolbar, so the tools do not jump in when the editor loads.
  toolbarSkeleton: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing.small,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  toolSkeleton: { alignItems: 'center', gap: spacing.xxsmall, minWidth: 88 },
  badge: {
    position: 'absolute',
    top: spacing.small,
    alignSelf: 'center',
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xxsmall,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  badgeText: { ...typography.caption, color: colors.white, fontWeight: '600' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.medium },
  headerButton: { minWidth: 32, minHeight: 32, alignItems: 'center', justifyContent: 'center' },
});
