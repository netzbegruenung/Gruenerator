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
import { type FreitextHandoff } from '../freitext/freitextHandoff';
import { MAX_PHOTOS, photoFileProblem, preparePhoto } from '../freitext/sharepicPhotos';
import {
  detectImageElements,
  editAiImage,
  removeImageBackground,
} from '../services/imageEditingService';

import { buildBoxEdit, clampBox, newBoxId } from './boxEdit';
import { type BevBox, type BevMode, type BevSettings, type BevVersion } from './types';

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
export const CREATE_MODES: BevMode[] = ['erstellen', 'sharepic'];

/** Modes selectable once an image exists (in composer/dropdown order). */
export const IMAGE_MODES: BevMode[] = [
  'bearbeiten',
  'boxen',
  'gruen-verwandeln',
  'vergroessern',
  'hintergrund',
];

export function useBildEditorV2() {
  const navigate = useNavigate();
  const [restored] = useState<PersistShape | null>(loadPersisted);

  const [versions, setVersions] = useState<BevVersion[]>(() => restored?.versions ?? []);
  const [activeId, setActiveId] = useState<string | null>(
    () => restored?.activeId ?? restored?.versions.at(-1)?.id ?? null
  );
  const location = useLocation();
  const wantsSharepic = (location.state as { mode?: unknown } | null)?.mode === 'sharepic';
  const [mode, setMode] = useState<BevMode>(() => {
    if (wantsSharepic) return 'sharepic';
    return (restored?.versions.length ?? 0) > 0 ? 'bearbeiten' : 'erstellen';
  });
  const [prompt, setPrompt] = useState('');
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

  const addReferences = useCallback(
    (files: File[]) => {
      // In „Sharepic" the files are photos for the draft, not references for an edit.
      const sharepic = mode === 'sharepic';
      const usable = sharepic
        ? files.filter((f) => {
            const problem = photoFileProblem(f);
            if (problem) setError(problem);
            return !problem;
          })
        : files;
      setReferences((prev) =>
        [...prev, ...usable].slice(0, sharepic ? MAX_PHOTOS : MAX_EDIT_IMAGES - 1)
      );
    },
    [mode]
  );

  // The files in the composer mean photos in „Sharepic" and references elsewhere.
  const changeMode = useCallback(
    (next: BevMode) => {
      if ((next === 'sharepic') !== (mode === 'sharepic')) setReferences([]);
      setMode(next);
    },
    [mode]
  );

  // The chat page without a hand-over, and the studio landing page, open this mode directly.
  useEffect(() => {
    if (!wantsSharepic) return;
    void navigate(location.pathname, { replace: true, state: null });
  }, [wantsSharepic, location.pathname, navigate]);
  const removeReference = useCallback((idx: number) => {
    setReferences((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const addVersion = useCallback((v: Omit<BevVersion, 'num'>) => {
    setVersions((prev) => [...prev, { ...v, num: prev.length + 1 }]);
    setActiveId(v.id);
    setPrompt('');
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

  // The chat page makes the sharepic. Photos go to the media library and are described first,
  // so what travels along is durable URLs, not files.
  const runSharepic = useCallback(
    async (text: string) => {
      const photos = await Promise.all(references.map((file) => preparePhoto(file)));
      const handoff: FreitextHandoff = { prompt: text, photos };
      void navigate('/studio/freitext', { state: handoff });
      setReferences([]);
    },
    [references, navigate]
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

  const submit = useCallback(async () => {
    if (generating) return;
    const text = prompt.trim();
    // Arrow enables at >=3 chars; generate/edit enforce their real minimums and
    // surface a friendly "zu kurz" error we catch below.
    if (mode === 'erstellen' && text.length < 3) return;
    // A photo alone is a sharepic request too.
    if (mode === 'sharepic' && text.length < 3 && references.length === 0) return;
    if (mode === 'bearbeiten' && (!active || text.length < 3)) return;
    if (mode === 'boxen' && (!active || boxesLoading)) return;
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
      else if (mode === 'sharepic') await runSharepic(text);
      else if (mode === 'bearbeiten') await runEdit(text);
      else if (mode === 'boxen') await runBoxEdit(text);
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
    runBoxEdit,
    boxesLoading,
    runGreenEdit,
    runOutpaint,
    runRemoveBg,
    runSharepic,
    references.length,
    startStatus,
    stopStatus,
  ]);

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
    setPrompt('');
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
    prompt,
    references,
    generating,
    statusText: mode === 'sharepic' ? 'Bereite die Fotos vor …' : STATUS_TEXTS[statusIdx],
    error,
    dragActive,
    settings,
    boxes,
    boxesLoading,
    boxesError,
    selectedBoxId,
    // setters / actions
    setMode: changeMode,
    setPrompt,
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
