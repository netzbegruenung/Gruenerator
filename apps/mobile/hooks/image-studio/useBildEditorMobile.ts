import { DEFAULT_STYLE_VARIANT, useKiImageGeneration } from '@gruenerator/shared/image-studio';
import { useShareStore } from '@gruenerator/shared/share';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import { File } from 'expo-file-system';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';

import {
  type BevMode,
  type BevSettings,
  type BevVersion,
} from '../../components/image-studio/bild-editor/types';
import {
  type BevImageRef,
  editAiImageMobile,
  outpaintMobile,
  pickImageForEditor,
  readAsDataUrl,
  removeBackgroundMobile,
  takePhotoForEditor,
  writeDataUrlToCache,
} from '../../services/imageEditMobile';
import { saveImageToGallery, shareImage } from '../../services/imageStudio';

const STORAGE_KEY = 'gruenerator-bildeditor-mobile';
const MAX_PERSISTED = 12;
const MAX_EDIT_IMAGES = 8; // contract cap: active version + references

// Maps a produced version to the imageType used by the share/recent-activity
// feed (`upload` never persists — an uploaded source isn't a creation).
const SHARE_IMAGE_TYPE: Record<Exclude<BevVersion['kind'], 'upload'>, string> = {
  create: 'pure-create',
  edit: 'universal-edit',
  green: 'green-edit',
  outpaint: 'pure-create',
  nobg: 'universal-edit',
};

const STATUS_TEXTS = [
  'Lasse die Magie wirken …',
  'Gute Bilder brauchen einen Moment …',
  'Die Farben finden ihren Platz …',
  'Gleich ist es so weit …',
];

const GREEN_DEFAULT_INSTRUCTION =
  'Verwandle diese Szene in einen grünen, lebenswerten Raum: mehr Bäume und Straßengrün, Blühflächen, geschützte Radwege und mehr Platz zum Verweilen.';

const DEFAULT_SETTINGS: BevSettings = {
  variant: DEFAULT_STYLE_VARIANT,
  kiLabel: 'full',
  aspect: '1:1',
};

/** Modes selectable once an image exists (in composer/dropdown order). */
export const IMAGE_MODES: BevMode[] = [
  'bearbeiten',
  'gruen-verwandeln',
  'vergroessern',
  'hintergrund',
];

interface PersistShape {
  versions: BevVersion[];
  activeId: string | null;
  settings?: Partial<BevSettings>;
}

function refOf(v: BevVersion): BevImageRef {
  return { uri: v.image, width: v.width, height: v.height };
}

export function useBildEditorMobile() {
  const [versions, setVersions] = useState<BevVersion[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mode, setMode] = useState<BevMode>('erstellen');
  const [prompt, setPrompt] = useState('');
  const [references, setReferences] = useState<BevImageRef[]>([]);
  const [generating, setGenerating] = useState(false);
  const [statusIdx, setStatusIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<BevSettings>(DEFAULT_SETTINGS);
  const [hydrated, setHydrated] = useState(false);

  const statusTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const { generatePureCreate } = useKiImageGeneration();
  const { createImageShare } = useShareStore();
  const queryClient = useQueryClient();

  const hasVersions = versions.length > 0;
  const screen: 'start' | 'result' = hasVersions ? 'result' : 'start';

  const active = useMemo(
    () => versions.find((v) => v.id === activeId) ?? null,
    [versions, activeId]
  );
  const activeHasChildren = useMemo(
    () => (active ? versions.some((v) => v.parentId === active.id) : false),
    [versions, active]
  );

  // Hydrate from AsyncStorage once, dropping versions whose cache file was evicted.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as PersistShape;
          const alive = (parsed.versions ?? []).filter((v) => {
            try {
              return new File(v.image).exists;
            } catch {
              return false;
            }
          });
          if (!cancelled && alive.length > 0) {
            setVersions(alive);
            setActiveId(
              alive.some((v) => v.id === parsed.activeId)
                ? parsed.activeId
                : (alive.at(-1)?.id ?? null)
            );
            setMode('bearbeiten');
            if (parsed.settings) setSettings((s) => ({ ...s, ...parsed.settings }));
          }
        }
      } catch {
        /* ignore corrupt persistence */
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist versions (capped), active id and settings once hydrated.
  useEffect(() => {
    if (!hydrated) return;
    const capped = versions.slice(-MAX_PERSISTED);
    void AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ versions: capped, activeId, settings } satisfies PersistShape)
    ).catch(() => {});
  }, [hydrated, versions, activeId, settings]);

  const stopStatus = useCallback(() => {
    if (statusTimer.current) {
      clearInterval(statusTimer.current);
      statusTimer.current = null;
    }
  }, []);

  const startStatus = useCallback(() => {
    setStatusIdx(0);
    stopStatus();
    statusTimer.current = setInterval(
      () => setStatusIdx((i) => (i + 1) % STATUS_TEXTS.length),
      5000
    );
  }, [stopStatus]);

  useEffect(() => () => stopStatus(), [stopStatus]);

  const addReferences = useCallback((refs: BevImageRef[]) => {
    setReferences((prev) => [...prev, ...refs].slice(0, MAX_EDIT_IMAGES - 1));
  }, []);
  const removeReference = useCallback((idx: number) => {
    setReferences((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const addVersion = useCallback((v: Omit<BevVersion, 'num'>) => {
    setVersions((prev) => [...prev, { ...v, num: prev.length + 1 }]);
    setActiveId(v.id);
    setPrompt('');
    setReferences([]);
  }, []);

  const commitProducedImage = useCallback(
    async (
      dataUrl: string,
      forPrompt: string,
      kind: Exclude<BevVersion['kind'], 'upload'>,
      parentId: string | null
    ) => {
      const stored = await writeDataUrlToCache(dataUrl);
      addVersion({
        id: 'v' + Date.now(),
        parentId,
        prompt: forPrompt,
        image: stored.uri,
        width: stored.width,
        height: stored.height,
        time: Date.now(),
        kind,
      });
      // Once an image exists the default action is refining it.
      setMode((m) => (m === 'erstellen' ? 'bearbeiten' : m));
      // Surface in the workplace „Zuletzt erstellt" feed (uploads are sources).
      void createImageShare({
        imageData: dataUrl,
        title: (forPrompt || 'KI-Bild').slice(0, 100),
        imageType: SHARE_IMAGE_TYPE[kind],
        status: 'ready',
        metadata: { prompt: forPrompt, source: 'bild-editor' },
      })
        .then(() => queryClient.invalidateQueries({ queryKey: ['recent-activity'] }))
        .catch(() => {});
    },
    [addVersion, createImageShare, queryClient]
  );

  const runCreate = useCallback(
    async (text: string) => {
      const dataUrl = await generatePureCreate({ description: text, variant: settings.variant });
      await commitProducedImage(dataUrl, text, 'create', null);
    },
    [generatePureCreate, settings.variant, commitProducedImage]
  );

  const runEdit = useCallback(
    async (text: string) => {
      if (!active) throw new Error('Kein Bild ausgewählt');
      const refs = [refOf(active), ...references].slice(0, MAX_EDIT_IMAGES);
      const dataUrl = await editAiImageMobile(refs, text, 'universal', settings.kiLabel);
      await commitProducedImage(dataUrl, text, 'edit', active.id);
    },
    [active, references, settings.kiLabel, commitProducedImage]
  );

  const runGreenEdit = useCallback(
    async (text: string) => {
      if (!active) throw new Error('Kein Bild ausgewählt');
      const instruction = text || GREEN_DEFAULT_INSTRUCTION;
      const dataUrl = await editAiImageMobile(
        [refOf(active)],
        instruction,
        'green-edit',
        settings.kiLabel
      );
      await commitProducedImage(dataUrl, text || 'Grün verwandelt', 'green', active.id);
    },
    [active, settings.kiLabel, commitProducedImage]
  );

  const runOutpaint = useCallback(async () => {
    if (!active) throw new Error('Kein Bild ausgewählt');
    const dataUrl = await outpaintMobile(refOf(active), settings.aspect, settings.kiLabel);
    await commitProducedImage(dataUrl, `Vergrößert · ${settings.aspect}`, 'outpaint', active.id);
  }, [active, settings.aspect, settings.kiLabel, commitProducedImage]);

  const runRemoveBg = useCallback(async () => {
    if (!active) throw new Error('Kein Bild ausgewählt');
    const dataUrl = await removeBackgroundMobile(refOf(active));
    await commitProducedImage(dataUrl, 'Hintergrund entfernt', 'nobg', active.id);
  }, [active, commitProducedImage]);

  const submit = useCallback(async () => {
    if (generating) return;
    const text = prompt.trim();
    if (mode === 'erstellen' && text.length < 3) return;
    if (mode === 'bearbeiten' && (!active || text.length < 3)) return;
    if (
      (mode === 'gruen-verwandeln' || mode === 'vergroessern' || mode === 'hintergrund') &&
      !active
    )
      return;

    setGenerating(true);
    setError(null);
    startStatus();
    try {
      if (mode === 'erstellen') await runCreate(text);
      else if (mode === 'bearbeiten') await runEdit(text);
      else if (mode === 'gruen-verwandeln') await runGreenEdit(text);
      else if (mode === 'vergroessern') await runOutpaint();
      else await runRemoveBg();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Etwas ist schiefgelaufen.');
    } finally {
      stopStatus();
      setGenerating(false);
    }
  }, [
    generating,
    prompt,
    mode,
    active,
    runCreate,
    runEdit,
    runGreenEdit,
    runOutpaint,
    runRemoveBg,
    startStatus,
    stopStatus,
  ]);

  const handleUpload = useCallback(
    (ref: BevImageRef) => {
      if (generating) return;
      addVersion({
        id: 'v' + Date.now(),
        parentId: null,
        prompt: 'Hochgeladen',
        image: ref.uri,
        width: ref.width,
        height: ref.height,
        time: Date.now(),
        kind: 'upload',
      });
      setMode('bearbeiten');
    },
    [generating, addVersion]
  );

  const uploadFromGallery = useCallback(async () => {
    const ref = await pickImageForEditor();
    if (ref) handleUpload(ref);
  }, [handleUpload]);

  const uploadFromCamera = useCallback(async () => {
    const ref = await takePhotoForEditor();
    if (ref) handleUpload(ref);
  }, [handleUpload]);

  const addReferenceFromGallery = useCallback(async () => {
    const ref = await pickImageForEditor();
    if (ref) addReferences([ref]);
  }, [addReferences]);

  const selectVersion = useCallback((id: string) => setActiveId(id), []);

  const download = useCallback(async () => {
    if (!active) return;
    try {
      const dataUrl = await readAsDataUrl(active.image);
      await saveImageToGallery(dataUrl);
    } catch {
      setError('Das Bild konnte nicht gespeichert werden.');
    }
  }, [active]);

  const share = useCallback(async () => {
    if (!active) return;
    try {
      const dataUrl = await readAsDataUrl(active.image);
      await shareImage(dataUrl);
    } catch {
      /* user cancelled or share failed — surfaced by the service alert */
    }
  }, [active]);

  const resetAll = useCallback(() => {
    Alert.alert('Neu starten', 'Alle Versionen löschen und neu starten?', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: () => {
          setVersions([]);
          setActiveId(null);
          setPrompt('');
          setReferences([]);
          setMode('erstellen');
          setError(null);
          void AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
        },
      },
    ]);
  }, []);

  return {
    // state
    versions,
    active,
    activeId,
    activeHasChildren,
    screen,
    mode,
    prompt,
    references,
    generating,
    statusText: STATUS_TEXTS[statusIdx],
    error,
    settings,
    // setters / actions
    setMode,
    setPrompt,
    addReferences,
    addReferenceFromGallery,
    removeReference,
    setSettings,
    submit,
    uploadFromGallery,
    uploadFromCamera,
    selectVersion,
    download,
    share,
    resetAll,
  };
}

export type BildEditorMobile = ReturnType<typeof useBildEditorMobile>;
