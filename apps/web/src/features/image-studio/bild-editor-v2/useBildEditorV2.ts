import { getGlobalApiClient } from '@gruenerator/shared/api';
import { useKiImageGeneration } from '@gruenerator/shared/image-studio';
import { useShareStore } from '@gruenerator/shared/share';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { downloadDataUrl } from '../../../utils/downloadFile';
import { seedCanvasQuery } from '../canvasQuery';
import { useCyclingStatus } from '../editor-shell/useCyclingStatus';
import { editAiImage, removeImageBackground } from '../services/imageEditingService';
import { dropTabPayload, readTabPayload } from '../tabHandoff';

import { mintProfilbildCanvas } from './canvasHandoff';
import { type BevMode, type BevSettings, type BevVersion } from './types';

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
export async function fileToDownscaledDataUrl(file: File): Promise<string> {
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
  kiLabel: 'full',
  aspect: '1:1',
};

/** Modes offered once an image exists, in chip order. */
export const IMAGE_MODES: BevMode[] = [
  'bearbeiten',
  'gruen-verwandeln',
  'vergroessern',
  'hintergrund',
  'profilbild',
];

/** What the Studio composer hands over: the chosen mode, its prompt and the image to work on. */
export interface BevEntryState {
  mode?: 'erstellen' | 'bearbeiten';
  prompt?: string;
  /** A file from router state, or a data URL when the request came in from another tab. */
  image?: File | string;
}

function readEntry(state: unknown): BevEntryState | null {
  const e = state as BevEntryState | null;
  if (!e || (!e.prompt && !e.image)) return null;
  return e;
}

export function useBildEditorV2() {
  const navigate = useNavigate();
  const [restored] = useState<PersistShape | null>(loadPersisted);

  const location = useLocation();
  // Opened from the Studio composer with a request: take over its image, then run its prompt.
  const [handoff] = useState<BevEntryState | null>(
    () => readEntry(location.state) ?? readEntry(readTabPayload(location.search))
  );
  // Cleared once the request has run, so it runs only once.
  const entry = useRef(handoff);
  const [versions, setVersions] = useState<BevVersion[]>(() => restored?.versions ?? []);
  const [activeId, setActiveId] = useState<string | null>(
    () => restored?.activeId ?? restored?.versions.at(-1)?.id ?? null
  );
  const [mode, setMode] = useState<BevMode>(
    () => handoff?.mode ?? ((restored?.versions.length ?? 0) > 0 ? 'bearbeiten' : 'erstellen')
  );
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<BevSettings>(() => ({
    ...DEFAULT_SETTINGS,
    ...restored?.settings,
  }));

  const { generatePureCreate } = useKiImageGeneration();
  const { createImageShare } = useShareStore();
  const queryClient = useQueryClient();

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

  const addVersion = useCallback((v: Omit<BevVersion, 'num'>) => {
    setVersions((prev) => [...prev, { ...v, num: prev.length + 1 }]);
    setActiveId(v.id);
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
      const image = await generatePureCreate({ description: text, kiLabel: settings.kiLabel });
      commitImage(image, text, 'create', null);
    },
    [generatePureCreate, settings.kiLabel, commitImage]
  );

  const runEdit = useCallback(
    async (text: string, references: readonly File[]) => {
      if (!active) throw new Error('Kein Bild ausgewählt');
      const base = await dataUrlToFile(active.image, `v${active.num}.jpg`);
      const files = [base, ...references].slice(0, MAX_EDIT_IMAGES);
      const res = await editAiImage(files, text, 'universal', undefined, {
        kiLabel: settings.kiLabel,
      });
      commitImage(res.base64, text, 'edit', active.id);
    },
    [active, settings.kiLabel, commitImage]
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

  /** Resolves `true` once a new version is committed. `references` go along with „Bearbeiten". */
  const submit = useCallback(
    async (input: string, references: readonly File[] = []): Promise<boolean> => {
      if (generating) return false;
      const text = input.trim();
      // The composer enables at >=3 chars; generate/edit enforce their real minimums and
      // surface a friendly "zu kurz" error we catch below.
      if (mode === 'erstellen' && text.length < 3) return false;
      if (mode === 'bearbeiten' && (!active || text.length < 3)) return false;
      if (mode !== 'erstellen' && !active) return false;

      setGenerating(true);
      setError(null);
      try {
        if (mode === 'erstellen') await runCreate(text);
        else if (mode === 'bearbeiten') await runEdit(text, references);
        else if (mode === 'gruen-verwandeln') await runGreenEdit(text);
        else if (mode === 'vergroessern') await runOutpaint();
        else if (mode === 'profilbild') await runProfilbild();
        else await runRemoveBg();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Etwas ist schiefgelaufen.');
        return false;
      } finally {
        setGenerating(false);
      }
    },
    [
      generating,
      mode,
      active,
      runCreate,
      runEdit,
      runGreenEdit,
      runOutpaint,
      runRemoveBg,
      runProfilbild,
    ]
  );

  const addUpload = useCallback(
    async (file: File) => {
      try {
        const image = await fileToDownscaledDataUrl(file);
        commitImage(image, file.name, 'upload', null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Upload fehlgeschlagen.');
      }
    },
    [commitImage]
  );

  const entryStarted = useRef(false);
  const [entryReady, setEntryReady] = useState(false);
  // A request that runs by itself shows the progress from the first paint. Display only:
  // `submit` still checks the real `generating`.
  const [entryPending, setEntryPending] = useState(() => !!handoff?.prompt);
  useEffect(() => {
    const e = entry.current;
    if (!e || entryStarted.current) return;
    entryStarted.current = true;
    if (e.image) {
      const image = e.image;
      const file =
        typeof image === 'string' ? dataUrlToFile(image, 'bild.jpg') : Promise.resolve(image);
      void file
        .then(addUpload)
        .catch(() => undefined)
        .then(() => setEntryReady(true));
    } else setEntryReady(true);
  }, [addUpload]);
  useEffect(() => {
    const e = entry.current;
    if (!entryReady || !e) return;
    entry.current = null;
    dropTabPayload(location.search);
    // Reloading must not repeat the request.
    void navigate(
      { pathname: location.pathname, search: '', hash: location.hash },
      { replace: true, state: null }
    );
    // `submit` raises `generating` in the same batch, so the progress never blinks off.
    setEntryPending(false);
    if (e.prompt) void submit(e.prompt);
  }, [entryReady, submit, navigate, location.pathname, location.search, location.hash]);

  const selectVersion = useCallback((id: string) => setActiveId(id), []);

  const download = useCallback(() => {
    if (!active) return;
    const ext = active.image.startsWith('data:image/png') ? 'png' : 'jpg';
    void downloadDataUrl(active.image, `gruenerator-bild-${active.num}.${ext}`);
  }, [active]);

  /** Drops every version; the Studio is where the next image begins. */
  const resetAll = useCallback(() => {
    if (!window.confirm('Alle Versionen löschen und zurück ins Studio?')) return;
    setVersions([]);
    setActiveId(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    void navigate('/studio', { replace: true });
  }, [navigate]);

  const busy = generating || entryPending;
  const statusText = useCyclingStatus(STATUS_TEXTS, busy);

  return {
    // state
    versions,
    active,
    activeId,
    activeHasChildren,
    handedOver: handoff !== null,
    handoffPrompt: handoff?.prompt || null,
    mode,
    generating: busy,
    statusText,
    error,
    settings,
    // setters / actions
    setMode,
    setSettings,
    submit,
    selectVersion,
    download,
    resetAll,
  };
}

export type BildEditorV2 = ReturnType<typeof useBildEditorV2>;
