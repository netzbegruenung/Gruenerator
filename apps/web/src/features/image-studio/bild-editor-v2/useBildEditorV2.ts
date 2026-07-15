import { DEFAULT_STYLE_VARIANT, useKiImageGeneration } from '@gruenerator/shared/image-studio';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { editAiImage } from '../services/imageEditingService';

import { type BevMode, type BevSettings, type BevVersion } from './types';

const STORAGE_KEY = 'gruenerator-bildeditor-v2';
const MAX_PERSISTED = 12;

const STATUS_TEXTS = [
  'Lasse die Magie wirken …',
  'Gute Bilder brauchen einen Moment …',
  'Die Farben finden ihren Platz …',
  'Gleich ist es so weit …',
];

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
};

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

  const addVersion = useCallback((v: Omit<BevVersion, 'num'>) => {
    setVersions((prev) => [...prev, { ...v, num: prev.length + 1 }]);
    setActiveId(v.id);
    setPrompt('');
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
      // Once an image exists, the only remaining action is refining it — lock the
      // composer to „Bearbeiten" so the next prompt edits the fresh image.
      setMode('bearbeiten');
    },
    [addVersion]
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
      const file = await dataUrlToFile(active.image, `v${active.num}.jpg`);
      const res = await editAiImage(file, text, 'universal', undefined, {
        kiLabel: settings.kiLabel,
      });
      commitImage(res.base64, text, 'edit', active.id);
    },
    [active, settings.kiLabel, commitImage]
  );

  const submit = useCallback(async () => {
    if (generating) return;
    const text = prompt.trim();
    // Arrow enables at >=3 chars; generatePureCreate enforces the real >=5 min
    // and surfaces a friendly "zu kurz" error we catch below.
    if (text.length < 3) return;
    if (mode === 'bearbeiten' && !active) return;

    setGenerating(true);
    setError(null);
    startStatus();
    try {
      if (mode === 'erstellen') await runCreate(text);
      else await runEdit(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Etwas ist schiefgelaufen.');
    } finally {
      stopStatus();
      setGenerating(false);
    }
  }, [generating, prompt, mode, active, runCreate, runEdit, startStatus, stopStatus]);

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
    generating,
    statusText: STATUS_TEXTS[statusIdx],
    error,
    dragActive,
    settings,
    // setters / actions
    setMode,
    setPrompt,
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
