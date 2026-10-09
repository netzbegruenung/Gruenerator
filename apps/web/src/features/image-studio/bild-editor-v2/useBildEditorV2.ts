import { getGlobalApiClient } from '@gruenerator/shared/api';
import {
  DEFAULT_IMAGE_FORMAT,
  DEFAULT_STYLE_VARIANT,
  useKiImageGeneration,
} from '@gruenerator/shared/image-studio';
import { useShareStore } from '@gruenerator/shared/share';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { downloadDataUrl } from '../../../utils/downloadFile';
import { seedCanvasQuery } from '../canvasQuery';
import { type FreitextHandoff } from '../freitext/freitextHandoff';
import {
  type CreatorPhoto,
  MAX_PHOTOS,
  photoFileProblem,
  preparePhoto,
} from '../freitext/sharepicPhotos';
import {
  detectImageElements,
  editAiImage,
  removeImageBackground,
} from '../services/imageEditingService';

import { buildBoxEdit, clampBox, newBoxId } from './boxEdit';
import { mintProfilbildCanvas } from './canvasHandoff';
import { type BevBox, type BevMode, type BevSettings, type BevVersion } from './types';

/** A photo picked in „Sharepic": prepared (library upload + analysis) from the moment it is picked. */
export interface BevPhoto {
  id: string;
  name: string;
  state: 'working' | 'ready' | 'failed';
  photo: CreatorPhoto | null;
  error: string | null;
}

const STORAGE_KEY = 'gruenerator-bildeditor-v2';
const MAX_PERSISTED = 12;

// Maps a produced version to the imageType used by the share/recent-activity
// feed (`upload` never persists — an uploaded source isn't a creation).
const SHARE_IMAGE_TYPE: Record<Exclude<BevVersion['kind'], 'upload'>, string> = {
  create: 'pure-create',
  edit: 'universal-edit',
  green: 'green-edit',
  outpaint: 'pure-create',
  nobg: 'universal-edit',
};
const MAX_EDIT_IMAGES = 10; // contract cap: active version + references

const STATUS_TEXTS = [
  'Lasse die Magie wirken …',
  'Gute Bilder brauchen einen Moment …',
  'Die Farben finden ihren Platz …',
  'Gleich ist es so weit …',
];

const GREEN_DEFAULT_INSTRUCTION =
  'Verwandle diese Szene in einen grünen, lebenswerten Raum: mehr Bäume und Straßengrün, Blühflächen, geschützte Radwege und mehr Platz zum Verweilen.';

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function dataUrlToFile(dataUrl: string, name: string): Promise<File> {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], name, { type: blob.type || 'image/jpeg' });
}

// Downscale an uploaded image so its data-URL stays modest (max edge 1400).
async function fileToDownscaledDataUrl(file: File): Promise<string> {
  const dataUrl = await readFileAsDataUrl(file);
  const img = await loadImg(dataUrl);
  const s = Math.min(1, 1400 / Math.max(img.width, img.height));
  if (s >= 1) return dataUrl;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * s);
  canvas.height = Math.round(img.height * s);
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.87);
}

interface PersistShape {
  versions: BevVersion[];
  activeId: string | null;
  settings?: Partial<BevSettings>;
}

function loadPersisted(): PersistShape | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistShape;
    if (parsed && Array.isArray(parsed.versions)) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

const DEFAULT_SETTINGS: BevSettings = {
  variant: DEFAULT_STYLE_VARIANT,
  kiLabel: 'full',
  format: DEFAULT_IMAGE_FORMAT,
  aspect: '1:1',
};

/** Modes offered before an image exists (in dropdown order). */
export const CREATE_MODES: BevMode[] = ['erstellen', 'sharepic', 'profilbild'];

/** Modes selectable once an image exists (in composer/dropdown order). */
export const IMAGE_MODES: BevMode[] = [
  'bearbeiten',
  'boxen',
  'gruen-verwandeln',
  'vergroessern',
  'hintergrund',
  'profilbild',
];

/** Modes another page may open the editor in via `location.state.mode`. */
const ENTRY_MODES: readonly BevMode[] = ['sharepic', 'profilbild'];

export function useBildEditorV2() {
  const navigate = useNavigate();
  const [restored] = useState<PersistShape | null>(loadPersisted);

  const location = useLocation();
  const requestedMode = (location.state as { mode?: unknown } | null)?.mode;
  const [versions, setVersions] = useState<BevVersion[]>(() => restored?.versions ?? []);
  // A profile picture starts from a fresh photo, so entering that mode opens the
  // upload prompt; the saved versions stay.
  const [activeId, setActiveId] = useState<string | null>(() =>
    requestedMode === 'profilbild'
      ? null
      : (restored?.activeId ?? restored?.versions.at(-1)?.id ?? null)
  );
  const [mode, setMode] = useState<BevMode>(() => {
    const entry = ENTRY_MODES.find((m) => m === requestedMode);
    if (entry) return entry;
    return (restored?.versions.length ?? 0) > 0 ? 'bearbeiten' : 'erstellen';
  });
  const [references, setReferences] = useState<File[]>([]);
  const [generating, setGenerating] = useState(false);
  const [statusIdx, setStatusIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [settings, setSettings] = useState<BevSettings>(() => ({
    ...DEFAULT_SETTINGS,
    ...restored?.settings,
  }));

  const statusTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // „Boxen" mode: user edits per version, on top of the detected elements.
  const [boxEdits, setBoxEdits] = useState<Record<string, BevBox[]>>({});
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);

  const { generatePureCreate } = useKiImageGeneration();
  const { createImageShare } = useShareStore();
  const queryClient = useQueryClient();

  const active = useMemo(
    () => versions.find((v) => v.id === activeId) ?? null,
    [versions, activeId]
  );
  const screen: 'start' | 'result' = active ? 'result' : 'start';
  const activeHasChildren = useMemo(
    () => (active ? versions.some((v) => v.parentId === active.id) : false),
    [versions, active]
  );

  // Detection is a model call: once per version, only while „Boxen" is open.
  const elementsQuery = useQuery({
    queryKey: ['bild-editor-elements', active?.id],
    enabled: mode === 'boxen' && !!active,
    staleTime: Infinity,
    retry: false,
    queryFn: async (): Promise<BevBox[]> => {
      if (!active) return [];
      const file = await dataUrlToFile(active.image, `v${active.num}.jpg`);
      const elements = await detectImageElements(file);
      return elements.map((e) => ({
        id: e.id,
        bbox: e.bbox,
        source: e.bbox,
        desc: e.desc,
        action: 'keep' as const,
        change: '',
      }));
    },
  });
  const boxes: BevBox[] | null = (active && boxEdits[active.id]) ?? elementsQuery.data ?? null;
  const boxesLoading = elementsQuery.isFetching;
  const boxesError = elementsQuery.error instanceof Error ? elementsQuery.error.message : null;

  // Persist versions (capped), active id, and settings.
  useEffect(() => {
    try {
      const capped = versions.slice(-MAX_PERSISTED);
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ versions: capped, activeId, settings } satisfies PersistShape)
      );
    } catch {
      /* quota — ignore, session stays in memory */
    }
  }, [versions, activeId, settings]);

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

  // Sharepic photos: one job per photo, started when it is picked. The jobs live in a ref so a
  // submit can wait for them and a retry never prepares a photo twice.
  const [photos, setPhotos] = useState<BevPhoto[]>([]);
  const photoList = useRef<BevPhoto[]>([]);
  const photoJobs = useRef(new Map<string, Promise<CreatorPhoto>>());
  const photoCount = useRef(0);
  // Bumped when the person leaves (unmount, other mode): a submit that is still waiting gives up.
  const epoch = useRef(0);
  useEffect(
    () => () => {
      epoch.current++;
    },
    []
  );

  const commitPhotos = useCallback((next: BevPhoto[]) => {
    photoList.current = next;
    setPhotos(next);
  }, []);
  const settlePhoto = useCallback(
    (id: string, patch: Partial<BevPhoto>) =>
      commitPhotos(photoList.current.map((p) => (p.id === id ? { ...p, ...patch } : p))),
    [commitPhotos]
  );
  const clearPhotos = useCallback(() => {
    epoch.current++;
    photoJobs.current.clear();
    commitPhotos([]);
  }, [commitPhotos]);

  const addPhotos = useCallback(
    (files: File[]) => {
      let next = photoList.current;
      let notice: string | null = null;
      for (const file of files) {
        const problem = photoFileProblem(file);
        if (problem) {
          notice = problem;
          continue;
        }
        if (next.length >= MAX_PHOTOS) {
          notice = `Mehr als ${MAX_PHOTOS} Fotos gehen nicht – die übrigen fehlen.`;
          break;
        }
        const id = `photo-${photoCount.current++}`;
        next = [...next, { id, name: file.name, state: 'working', photo: null, error: null }];
        const job = preparePhoto(file);
        photoJobs.current.set(id, job);
        job.then(
          (photo) => settlePhoto(id, { state: 'ready', photo }),
          (err: unknown) =>
            settlePhoto(id, {
              state: 'failed',
              error: err instanceof Error ? err.message : 'Upload fehlgeschlagen.',
            })
        );
      }
      setError(notice);
      commitPhotos(next);
    },
    [commitPhotos, settlePhoto]
  );

  const removePhoto = useCallback(
    (id: string) => {
      photoJobs.current.delete(id);
      commitPhotos(photoList.current.filter((p) => p.id !== id));
    },
    [commitPhotos]
  );

  const addReferences = useCallback(
    (files: File[]) => {
      // In „Sharepic" the files are photos for the draft, not references for an edit.
      if (mode === 'sharepic') {
        addPhotos(files);
        return;
      }
      setReferences((prev) => [...prev, ...files].slice(0, MAX_EDIT_IMAGES - 1));
    },
    [mode, addPhotos]
  );

  // The files in the composer mean photos in „Sharepic" and references elsewhere.
  const changeMode = useCallback(
    (next: BevMode) => {
      if ((next === 'sharepic') !== (mode === 'sharepic')) {
        setReferences([]);
        clearPhotos();
      }
      setMode(next);
    },
    [mode, clearPhotos]
  );

  const removeReference = useCallback((idx: number) => {
    setReferences((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const addVersion = useCallback((v: Omit<BevVersion, 'num'>) => {
    setVersions((prev) => [...prev, { ...v, num: prev.length + 1 }]);
    setActiveId(v.id);
    setReferences([]);
  }, []);

  const commitImage = useCallback(
    (image: string, forPrompt: string, kind: BevVersion['kind'], parentId: string | null) => {
      addVersion({
        id: 'v' + Date.now(),
        parentId,
        prompt: forPrompt,
        image,
        time: Date.now(),
        kind,
      });
      // Once an image exists the default action is refining it.
      setMode((m) => (m === 'erstellen' || m === 'sharepic' ? 'bearbeiten' : m));
      // Persist generated/edited results to the share store so they surface in
      // the workplace „Zuletzt erstellt" feed (uploads are sources, not creations).
      if (kind !== 'upload') {
        void createImageShare({
          imageData: image,
          title: (forPrompt || 'KI-Bild').slice(0, 100),
          imageType: SHARE_IMAGE_TYPE[kind],
          // Every kind reaching this branch is AI output — `upload` returned above.
          contentOrigin: 'ki',
          status: 'ready',
          metadata: { prompt: forPrompt, source: 'bild-editor' },
        })
          .then(() => queryClient.invalidateQueries({ queryKey: ['recent-activity'] }))
          .catch(() => {});
      }
    },
    [addVersion, createImageShare, queryClient]
  );

  const runCreate = useCallback(
    async (text: string) => {
      const image = await generatePureCreate({
        description: text,
        variant: settings.variant,
        format: settings.format,
        kiLabel: settings.kiLabel,
        ...(settings.layout && { layout: true }),
      });
      commitImage(image, text, 'create', null);
    },
    [
      generatePureCreate,
      settings.variant,
      settings.format,
      settings.kiLabel,
      settings.layout,
      commitImage,
    ]
  );

  // The chat page makes the sharepic. The photos are in the media library and described by now
  // (or the submit waits for the ones still working), so what travels along is durable URLs.
  const runSharepic = useCallback(
    async (text: string) => {
      const mine = epoch.current;
      await Promise.allSettled(
        photoList.current.flatMap((p) => {
          const job = photoJobs.current.get(p.id);
          return job ? [job] : [];
        })
      );
      // Left the page (or the mode) while the photos were being prepared: stay where they are.
      if (mine !== epoch.current) return;
      const failed = photoList.current.filter((p) => p.state !== 'ready' || !p.photo);
      if (failed.length) {
        throw new Error(
          `${failed.map((p) => `„${p.name}“`).join(', ')}: ${failed[0]?.error ?? 'Foto nicht bereit.'} Entferne das Foto oder wähle es neu.`
        );
      }
      const handoff: FreitextHandoff = {
        prompt: text,
        photos: photoList.current.flatMap((p) => (p.photo ? [p.photo] : [])),
      };
      // Back from the chat lands here in „Sharepic" mode again.
      void navigate(
        { pathname: location.pathname, search: location.search, hash: location.hash },
        { replace: true, state: { mode: 'sharepic' } }
      );
      void navigate('/studio/freitext', { state: handoff });
      clearPhotos();
    },
    [navigate, location.pathname, location.search, location.hash, clearPhotos]
  );

  const runEdit = useCallback(
    async (text: string) => {
      if (!active) throw new Error('Kein Bild ausgewählt');
      const base = await dataUrlToFile(active.image, `v${active.num}.jpg`);
      const files = [base, ...references].slice(0, MAX_EDIT_IMAGES);
      const res = await editAiImage(files, text, 'universal', undefined, {
        kiLabel: settings.kiLabel,
        ...(settings.autoBoxes && { boxes: 'auto' as const }),
      });
      commitImage(res.base64, text, 'edit', active.id);
    },
    [active, references, settings.kiLabel, settings.autoBoxes, commitImage]
  );

  const runBoxEdit = useCallback(
    async (text: string) => {
      if (!active) throw new Error('Kein Bild ausgewählt');
      const edit = boxes ? buildBoxEdit(boxes, text) : null;
      if (!edit && text.length < 3) {
        throw new Error('Ändere eine Box oder beschreibe, was sich ändern soll.');
      }
      const base = await dataUrlToFile(active.image, `v${active.num}.jpg`);
      const res = await editAiImage(base, edit?.instruction ?? text, 'universal', 'flux-pro', {
        kiLabel: settings.kiLabel,
        boxes: edit ?? 'auto',
      });
      commitImage(res.base64, text || 'Boxen bearbeitet', 'edit', active.id);
    },
    [active, boxes, settings.kiLabel, commitImage]
  );

  const writeBoxes = useCallback(
    (next: BevBox[]) => {
      if (!active) return;
      setBoxEdits((prev) => ({ ...prev, [active.id]: next }));
    },
    [active]
  );

  const updateBox = useCallback(
    (id: string, patch: Partial<Omit<BevBox, 'id'>>) => {
      if (!boxes) return;
      writeBoxes(
        boxes.map((b) =>
          b.id === id ? { ...b, ...patch, ...(patch.bbox && { bbox: clampBox(patch.bbox) }) } : b
        )
      );
    },
    [boxes, writeBoxes]
  );

  const addBox = useCallback(() => {
    const list = boxes ?? [];
    const id = newBoxId(list);
    writeBoxes([
      ...list,
      { id, bbox: [350, 350, 650, 650], source: null, desc: '', action: 'change', change: '' },
    ]);
    setSelectedBoxId(id);
  }, [boxes, writeBoxes]);

  const removeAddedBox = useCallback(
    (id: string) => {
      if (boxes) writeBoxes(boxes.filter((b) => b.id !== id || b.source !== null));
      setSelectedBoxId(null);
    },
    [boxes, writeBoxes]
  );

  const resetBoxes = useCallback(() => {
    if (!active) return;
    setBoxEdits(({ [active.id]: _dropped, ...rest }) => rest);
    setSelectedBoxId(null);
    void elementsQuery.refetch();
  }, [active, elementsQuery]);

  const runGreenEdit = useCallback(
    async (text: string) => {
      if (!active) throw new Error('Kein Bild ausgewählt');
      const instruction = text || GREEN_DEFAULT_INSTRUCTION;
      const file = await dataUrlToFile(active.image, `v${active.num}.jpg`);
      const res = await editAiImage(file, instruction, 'green-edit', undefined, {
        kiLabel: settings.kiLabel,
      });
      commitImage(res.base64, text || 'Grün verwandelt', 'green', active.id);
    },
    [active, settings.kiLabel, commitImage]
  );

  const runOutpaint = useCallback(async () => {
    if (!active) throw new Error('Kein Bild ausgewählt');
    // The server derives the canvas from the source and scales both when the
    // budget demands it, so every offered format is reachable from here.
    const file = await dataUrlToFile(active.image, `v${active.num}.jpg`);
    const form = new FormData();
    form.append('image', file);
    form.append('aspectRatio', settings.aspect);
    if (settings.kiLabel !== 'full') form.append('kiLabel', settings.kiLabel);
    const res = await getGlobalApiClient().post<{
      success: boolean;
      image?: { base64?: string };
      error?: string;
    }>('/imagine/outpaint', form, { headers: { 'Content-Type': 'multipart/form-data' } });
    if (!res.data.success || !res.data.image?.base64) {
      throw new Error(res.data.error || 'Vergrößerung fehlgeschlagen');
    }
    const raw = res.data.image.base64;
    const dataUrl = raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}`;
    commitImage(dataUrl, `Vergrößert · ${settings.aspect}`, 'outpaint', active.id);
  }, [active, settings.aspect, settings.kiLabel, commitImage]);

  const runRemoveBg = useCallback(async () => {
    if (!active) throw new Error('Kein Bild ausgewählt');
    const file = await dataUrlToFile(active.image, `v${active.num}.png`);
    const res = await removeImageBackground(file);
    commitImage(res.base64, 'Hintergrund entfernt', 'nobg', active.id);
  }, [active, commitImage]);

  // A version that is already cut out is reused, so a retry after a failed mint skips the removal.
  const runProfilbild = useCallback(async () => {
    if (!active) throw new Error('Kein Foto ausgewählt');
    let transparent = active.image;
    if (active.kind !== 'nobg') {
      const file = await dataUrlToFile(active.image, `v${active.num}.png`);
      transparent = (await removeImageBackground(file)).base64;
      commitImage(transparent, 'Hintergrund entfernt', 'nobg', active.id);
    }
    const canvas = await mintProfilbildCanvas(transparent, 'Profilbild');
    seedCanvasQuery(queryClient, canvas);
    void navigate(`/studio/canvas/${canvas.id}`);
  }, [active, commitImage, queryClient, navigate]);

  /** Resolves `true` once a new version is committed, so the caller can clear its input. */
  const submit = useCallback(
    async (input: string): Promise<boolean> => {
      if (generating) return false;
      const text = input.trim();
      // Arrow enables at >=3 chars; generate/edit enforce their real minimums and
      // surface a friendly "zu kurz" error we catch below.
      if (mode === 'erstellen' && text.length < 3) return false;
      // A photo alone is a sharepic request too.
      if (mode === 'sharepic' && text.length < 3 && photoList.current.length === 0) return false;
      if (mode === 'bearbeiten' && (!active || text.length < 3)) return false;
      if (mode === 'boxen' && (!active || boxesLoading)) return false;
      if (
        (mode === 'gruen-verwandeln' ||
          mode === 'vergroessern' ||
          mode === 'hintergrund' ||
          mode === 'profilbild') &&
        !active
      )
        return false;

      setGenerating(true);
      setError(null);
      startStatus();
      try {
        if (mode === 'erstellen') await runCreate(text);
        else if (mode === 'sharepic') await runSharepic(text);
        else if (mode === 'bearbeiten') await runEdit(text);
        else if (mode === 'boxen') await runBoxEdit(text);
        else if (mode === 'gruen-verwandeln') await runGreenEdit(text);
        else if (mode === 'vergroessern') await runOutpaint();
        else if (mode === 'profilbild') await runProfilbild();
        else await runRemoveBg();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Etwas ist schiefgelaufen.');
        return false;
      } finally {
        stopStatus();
        setGenerating(false);
      }
    },
    [
      generating,
      mode,
      active,
      runCreate,
      runEdit,
      runBoxEdit,
      boxesLoading,
      runGreenEdit,
      runOutpaint,
      runRemoveBg,
      runProfilbild,
      runSharepic,
      startStatus,
      stopStatus,
    ]
  );

  const handleUpload = useCallback(
    async (file: File) => {
      if (generating) return;
      // In „Sharepic" a dropped image is a photo for the draft, not a new version.
      if (mode === 'sharepic') {
        addReferences([file]);
        return;
      }
      try {
        const image = await fileToDownscaledDataUrl(file);
        commitImage(image, file.name, 'upload', null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Upload fehlgeschlagen.');
      }
    },
    [generating, mode, addReferences, commitImage]
  );

  const selectVersion = useCallback((id: string) => setActiveId(id), []);

  const download = useCallback(() => {
    if (!active) return;
    void downloadDataUrl(active.image, `gruenerator-bild-${active.num}.jpg`);
  }, [active]);

  const resetAll = useCallback(() => {
    if (!window.confirm('Alle Versionen löschen und neu starten?')) return;
    setVersions([]);
    setActiveId(null);
    setReferences([]);
    setMode('erstellen');
    setError(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  return {
    // state
    versions,
    active,
    activeId,
    activeHasChildren,
    screen,
    mode,
    references,
    generating,
    statusText: mode === 'sharepic' ? 'Bereite alles für den Chat vor …' : STATUS_TEXTS[statusIdx],
    error,
    dragActive,
    settings,
    boxes,
    boxesLoading,
    boxesError,
    selectedBoxId,
    // setters / actions
    setMode: changeMode,
    photos,
    removePhoto,
    addReferences,
    removeReference,
    setDragActive,
    setSettings,
    setSelectedBoxId,
    updateBox,
    addBox,
    removeAddedBox,
    resetBoxes,
    submit,
    handleUpload,
    selectVersion,
    download,
    resetAll,
  };
}

export type BildEditorV2 = ReturnType<typeof useBildEditorV2>;
