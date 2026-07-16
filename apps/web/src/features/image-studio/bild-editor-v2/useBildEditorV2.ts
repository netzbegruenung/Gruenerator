import { getGlobalApiClient } from '@gruenerator/shared/api';
import { DEFAULT_STYLE_VARIANT, useKiImageGeneration } from '@gruenerator/shared/image-studio';
import { useShareStore } from '@gruenerator/shared/share';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { editAiImage, removeImageBackground } from '../services/imageEditingService';

import { type BevAspect, type BevMode, type BevSettings, type BevVersion } from './types';

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
const MAX_EDIT_IMAGES = 8; // contract cap: active version + references

const STATUS_TEXTS = [
  'Lasse die Magie wirken …',
  'Gute Bilder brauchen einen Moment …',
  'Die Farben finden ihren Platz …',
  'Gleich ist es so weit …',
];

const GREEN_DEFAULT_INSTRUCTION =
  'Verwandle diese Szene in einen grünen, lebenswerten Raum: mehr Bäume und Straßengrün, Blühflächen, geschützte Radwege und mehr Platz zum Verweilen.';

// Mirrors the server-side outpaint budget used in the Workplace „Bilder" tab.
const MIN_OUTPAINT_SIDE = 256;
const MAX_OUTPAINT_SIDE = 2048;
const MAX_OUTPAINT_AREA = 4_194_304;
const SAME_RATIO_EXPANSION = 1.22;

const ASPECT_VALUE: Record<BevAspect, number> = {
  '16:9': 16 / 9,
  '4:3': 4 / 3,
  '1:1': 1,
  '3:4': 3 / 4,
  '9:16': 9 / 16,
};

function computeOutpaintGeometry(
  srcW: number,
  srcH: number,
  aspect: BevAspect
): { width: number; height: number } {
  const target = ASPECT_VALUE[aspect];
  const input = srcW / srcH;
  let tw: number;
  let th: number;
  if (Math.abs(input - target) < 0.01) {
    tw = Math.round(srcW * SAME_RATIO_EXPANSION);
    th = Math.round(srcH * SAME_RATIO_EXPANSION);
  } else if (input > target) {
    tw = srcW;
    th = Math.round(srcW / target);
  } else {
    tw = Math.round(srcH * target);
    th = srcH;
  }
  return { width: tw, height: th };
}

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
  aspect: '1:1',
};

/** Modes selectable once an image exists (in composer/dropdown order). */
export const IMAGE_MODES: BevMode[] = [
  'bearbeiten',
  'gruen-verwandeln',
  'vergroessern',
  'hintergrund',
];

export function useBildEditorV2() {
  const [restored] = useState<PersistShape | null>(loadPersisted);

  const [versions, setVersions] = useState<BevVersion[]>(() => restored?.versions ?? []);
  const [activeId, setActiveId] = useState<string | null>(
    () => restored?.activeId ?? restored?.versions.at(-1)?.id ?? null
  );
  const [mode, setMode] = useState<BevMode>(() =>
    (restored?.versions.length ?? 0) > 0 ? 'bearbeiten' : 'erstellen'
  );
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

  const addReferences = useCallback((files: File[]) => {
    setReferences((prev) => [...prev, ...files].slice(0, MAX_EDIT_IMAGES - 1));
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
      setMode((m) => (m === 'erstellen' ? 'bearbeiten' : m));
      // Persist generated/edited results to the share store so they surface in
      // the workplace „Zuletzt erstellt" feed (uploads are sources, not creations).
      if (kind !== 'upload') {
        void createImageShare({
          imageData: image,
          title: (forPrompt || 'KI-Bild').slice(0, 100),
          imageType: SHARE_IMAGE_TYPE[kind],
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
      const image = await generatePureCreate({ description: text, variant: settings.variant });
      commitImage(image, text, 'create', null);
    },
    [generatePureCreate, settings.variant, commitImage]
  );

  const runEdit = useCallback(
    async (text: string) => {
      if (!active) throw new Error('Kein Bild ausgewählt');
      const base = await dataUrlToFile(active.image, `v${active.num}.jpg`);
      const files = [base, ...references].slice(0, MAX_EDIT_IMAGES);
      const res = await editAiImage(files, text, 'universal', undefined, {
        kiLabel: settings.kiLabel,
      });
      commitImage(res.base64, text, 'edit', active.id);
    },
    [active, references, settings.kiLabel, commitImage]
  );

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
    const img = await loadImg(active.image);
    const geo = computeOutpaintGeometry(img.width, img.height, settings.aspect);
    if (Math.max(geo.width, geo.height) > MAX_OUTPAINT_SIDE) {
      throw new Error(
        `Dein Bild ist zu groß für das Format ${settings.aspect}. Bitte ein kleineres Bild verwenden.`
      );
    }
    if (geo.width < MIN_OUTPAINT_SIDE || geo.width * geo.height > MAX_OUTPAINT_AREA) {
      throw new Error('Zielgröße außerhalb des erlaubten Bereichs.');
    }
    const file = await dataUrlToFile(active.image, `v${active.num}.jpg`);
    const form = new FormData();
    form.append('image', file);
    form.append('aspectRatio', 'custom');
    form.append('width', String(geo.width));
    form.append('height', String(geo.height));
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
    async (file: File) => {
      if (generating) return;
      try {
        const image = await fileToDownscaledDataUrl(file);
        commitImage(image, file.name, 'upload', null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Upload fehlgeschlagen.');
      }
    },
    [generating, commitImage]
  );

  const selectVersion = useCallback((id: string) => setActiveId(id), []);

  const download = useCallback(() => {
    if (!active) return;
    const link = document.createElement('a');
    link.href = active.image;
    link.download = `gruenerator-bild-${active.num}.jpg`;
    link.click();
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
    statusText: STATUS_TEXTS[statusIdx],
    error,
    dragActive,
    settings,
    // setters / actions
    setMode,
    setPrompt,
    addReferences,
    removeReference,
    setDragActive,
    setSettings,
    submit,
    handleUpload,
    selectVersion,
    download,
    resetAll,
  };
}

export type BildEditorV2 = ReturnType<typeof useBildEditorV2>;
