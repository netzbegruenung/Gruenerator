import { useKiImageGeneration } from '@gruenerator/shared/image-studio';
import { useShareStore } from '@gruenerator/shared/share';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { downloadDataUrl } from '../../../utils/downloadFile';
import { useCyclingStatus } from '../editor-shell/useCyclingStatus';
import { detectImageElements, editAiImage } from '../services/imageEditingService';
import { dropTabPayload, readTabPayload } from '../tabHandoff';
import { fileToDownscaledDataUrl } from '../utils/downscaleImage';

import { clearBevState, loadBevState, saveBevMeta, saveBevVersions } from './bevPersistence';
import { boxSummary, buildBoxEdit, clampBox, newBoxId } from './boxEdit';
import { type BevBox, type BevMode, type BevVersion } from './types';

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

// Every result carries the full label; there is no choice for it in the chat.
const KI_LABEL = 'full';

async function dataUrlToFile(dataUrl: string, name: string): Promise<File> {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], name, { type: blob.type || 'image/jpeg' });
}

/** What the Studio composer hands over: the chosen mode, its prompt and the image to work on. */
export interface BevEntryState {
  mode?: 'erstellen' | 'bearbeiten';
  prompt?: string;
  /** A file from router state, or a data URL when the request came in from another tab. */
  image?: File | string;
}

/** axios aborts with its own English message; the chat shows German. */
function errorText(e: unknown): string {
  if ((e as { code?: unknown } | null)?.code === 'ECONNABORTED') {
    return 'Das hat zu lange gedauert. Bitte versuche es noch einmal.';
  }
  return e instanceof Error ? e.message : 'Etwas ist schiefgelaufen.';
}

function readEntry(state: unknown): BevEntryState | null {
  const e = state as BevEntryState | null;
  if (!e || (!e.prompt && !e.image)) return null;
  return e;
}

export function useBildEditorV2() {
  const navigate = useNavigate();
  const location = useLocation();
  // Opened from the Studio composer with a request: take over its image, then run its prompt.
  const [handoff] = useState<BevEntryState | null>(
    () => readEntry(location.state) ?? readEntry(readTabPayload(location.search))
  );
  // Cleared once the request has run, so it runs only once.
  const entry = useRef(handoff);
  const [versions, setVersions] = useState<BevVersion[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mode, setMode] = useState<BevMode>(handoff?.mode ?? 'erstellen');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The request on its way, as the chat shows it (at first the one the Studio handed over). It
  // becomes a version, or stays with the error below it.
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(handoff?.prompt || null);

  // The saved versions arrive asynchronously; until then nothing is saved (the empty start state
  // would overwrite them) and a request handed over from the Studio waits.
  const [hydrated, setHydrated] = useState(false);
  const handoffMode = handoff?.mode;
  useEffect(() => {
    let cancelled = false;
    void loadBevState().then((restored) => {
      if (cancelled) return;
      if (restored) {
        setVersions(restored.versions);
        setActiveId(restored.activeId ?? restored.versions.at(-1)?.id ?? null);
        if (!handoffMode && restored.versions.length > 0) setMode('bearbeiten');
      }
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [handoffMode]);

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

  // Expert mode: the elements of the active version as editable boxes. Detection is a model
  // call, so it starts only once the mode was opened; from then on every new version is
  // detected in the background, and the result stays cached per version.
  const [expert, setExpert] = useState(false);
  const [expertUsed, setExpertUsed] = useState(false);
  const [boxEdits, setBoxEdits] = useState<Record<string, BevBox[]>>({});
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const toggleExpert = useCallback(() => {
    setExpert((on) => !on);
    setExpertUsed(true);
    setSelectedBoxId(null);
  }, []);
  const elementsQuery = useQuery({
    queryKey: ['bild-editor-elements', active?.id],
    enabled: expertUsed && !!active,
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
        label: e.label ?? '',
        action: 'keep' as const,
        change: '',
      }));
    },
  });
  const boxes: BevBox[] | null = (active && boxEdits[active.id]) ?? elementsQuery.data ?? null;
  const boxesLoading = elementsQuery.isFetching;
  const boxesError = elementsQuery.error ? errorText(elementsQuery.error) : null;

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
      {
        id,
        // Upper middle, so its menu fits underneath.
        bbox: [250, 375, 500, 625],
        source: null,
        desc: '',
        label: '',
        action: 'change',
        change: '',
      },
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

  // Versions are written only when they change, so switching between them never rewrites the images.
  useEffect(() => {
    if (hydrated) void saveBevVersions(versions.slice(-MAX_PERSISTED));
  }, [hydrated, versions]);
  useEffect(() => {
    if (hydrated) void saveBevMeta({ activeId });
  }, [hydrated, activeId]);

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
      // Once an image exists every message edits it.
      setMode('bearbeiten');
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
      const image = await generatePureCreate({ description: text, kiLabel: KI_LABEL });
      commitImage(image, text, 'create', null);
    },
    [generatePureCreate, commitImage]
  );

  const runEdit = useCallback(
    async (text: string, references: readonly File[]) => {
      if (!active) throw new Error('Kein Bild ausgewählt');
      const base = await dataUrlToFile(active.image, `v${active.num}.jpg`);
      const files = [base, ...references].slice(0, MAX_EDIT_IMAGES);
      const res = await editAiImage(files, text, 'universal', undefined, { kiLabel: KI_LABEL });
      commitImage(res.base64, text, 'edit', active.id);
    },
    [active, commitImage]
  );

  // The changed boxes go to FLUX 3 as rows; the chat text, if any, rides along in the instruction.
  const runBoxEdit = useCallback(
    async (prompt: string, edit: NonNullable<ReturnType<typeof buildBoxEdit>>) => {
      if (!active) throw new Error('Kein Bild ausgewählt');
      const base = await dataUrlToFile(active.image, `v${active.num}.jpg`);
      const res = await editAiImage(base, edit.instruction, 'universal', 'flux-pro', {
        kiLabel: KI_LABEL,
        boxes: edit,
      });
      setSelectedBoxId(null);
      commitImage(res.base64, prompt, 'edit', active.id);
    },
    [active, commitImage]
  );

  /** Resolves `true` once a new version is committed. `references` go along with „Bearbeiten". */
  const submit = useCallback(
    async (input: string, references: readonly File[] = []): Promise<boolean> => {
      if (generating) return false;
      const text = input.trim();
      // Changed boxes are an edit of their own; the text is optional then.
      const boxEdit =
        expert && mode === 'bearbeiten' && boxes && !boxesLoading
          ? buildBoxEdit(boxes, text)
          : null;
      // The composer enables at >=3 chars; generate/edit enforce their real minimums and
      // surface a friendly "zu kurz" error we catch below.
      if (!boxEdit && text.length < 3) return false;
      if (mode === 'bearbeiten' && !active) return false;

      const summary = boxEdit && boxes ? boxSummary(boxes) : '';
      const prompt = [text, summary].filter(Boolean).join(' · ');

      setGenerating(true);
      setError(null);
      setPendingPrompt(prompt);
      try {
        if (mode === 'erstellen') await runCreate(text);
        else if (boxEdit) await runBoxEdit(prompt, boxEdit);
        else await runEdit(text, references);
        setPendingPrompt(null);
        return true;
      } catch (e) {
        setError(errorText(e));
        return false;
      } finally {
        setGenerating(false);
      }
    },
    [generating, mode, active, expert, boxes, boxesLoading, runCreate, runEdit, runBoxEdit]
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
    if (!hydrated || !e || entryStarted.current) return;
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
  }, [hydrated, addUpload]);
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

  // Box ids come from each version's own detection, so a selection does not carry over.
  const selectVersion = useCallback((id: string) => {
    setActiveId(id);
    setSelectedBoxId(null);
  }, []);

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
    void clearBevState();
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
    restoring: !hydrated,
    handedOver: handoff !== null,
    pendingPrompt,
    generating: busy,
    statusText,
    error,
    expert,
    boxes,
    boxesLoading,
    boxesError,
    selectedBoxId,
    // actions
    submit,
    selectVersion,
    download,
    resetAll,
    toggleExpert,
    setSelectedBoxId,
    updateBox,
    addBox,
    removeAddedBox,
    resetBoxes,
  };
}

export type BildEditorV2 = ReturnType<typeof useBildEditorV2>;
